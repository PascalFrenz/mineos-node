import { Server } from "socket.io";
import { MINE_OS } from "../mineos";
import winston from "winston";
import fs from "fs-extra";
import { constants } from "fs";
import async from "async";
import path from "path";
import { CronJob } from "cron";
import { Tail } from "tail";
import auth from "../auth";
import uuid from "node-uuid";
import hash from "object-hash";
import introspect from "introspect";
import { FSWatcher, watch } from "chokidar";

export class ServerContainer {

  private instance: any;
  private nsp;
  private tails;
  private notices: any[];
  private cron;
  private intervals;
  private COMMIT_INTERVAL_MIN = null;
  private HEARTBEAT_INTERVAL_MS = 5000;
  private configFileWatcher: FSWatcher;
  private makeTailFileWatcher?: FSWatcher;

  constructor(private server_name: string, private user_config: Record<string, any>, private socket_io: Server) {
    // when evoked, creates a permanent 'mc' instance, namespace, and place for file tails.
    this.instance = new MINE_OS.mc(server_name, user_config.base_directory);
    this.nsp = socket_io.of(`/${server_name}`);
    this.tails = {};
    this.notices = [];
    this.cron = {};
    this.intervals = {}


    this.intervals['heartbeat'] = setInterval(this.heartbeat, this.HEARTBEAT_INTERVAL_MS);
    this.intervals['world_commit'] = setInterval(this.world_committer, 60 * 1000);

    winston.info(`[${server_name}] Discovered server`);

    // check that awd and bwd also exist alongside cwd or create and chown
    let missing_dir = false;
    try {
      fs.accessSync(this.instance.env.bwd, constants.F_OK)
    } catch (e) {
      missing_dir = true
    }
    try {
      fs.accessSync(this.instance.env.awd, constants.F_OK)
    } catch (e) {
      missing_dir = true
    }

    if (missing_dir) {
      async.series([
        async.apply(fs.ensureDir, this.instance.env.bwd),
        async.apply(fs.ensureDir, this.instance.env.awd),
        async.apply(this.instance.sync_chown)
      ]);
    }

    //async.series([ async.apply(instance.sync_chown) ]);
    //uncomment sync_chown to correct perms on server discovery
    //commenting out for high cpu usage on startup

    let files_to_tail = ['logs/latest.log', 'server.log', 'proxy.log.0', 'logs/fml-server-latest.log'];
    if ((user_config || {}).additional_logfiles) {  //if additional_logfiles key:value pair exists, use it
      let additional = user_config['additional_logfiles'].split(',');
      additional = additional.filter(function (e) {
        return e
      }); //remove non-truthy entries like ''
      additional = additional.map(function (e) {
        return e.trim()
      }); //remove trailing and tailing whitespace
      additional = additional.map(function (e) {
        return path.normalize(e).replace(/^(\.\.[\/\\])+/, '')
      }); //normalize path, remove traversal

      winston.info('Explicitly added files to tail are:', additional);
      files_to_tail = files_to_tail.concat(additional);
    }

    for (let i in files_to_tail)
      this.make_tail(files_to_tail[i]);


    let skip_dirs: string[] = fs.readdirSync(this.instance.env.cwd).filter((p) => {
      try {
        return fs.statSync(path.join(this.instance.env.cwd, p)).isDirectory();
      } catch (e) {
        winston.error(e);
        return false;
      }
    });

    const default_skips = ['world', 'world_the_end', 'world_nether', 'dynmap', 'plugins', 'web', 'region', 'playerdata', 'stats', 'data'];
    for (let i in default_skips)
      if (skip_dirs.indexOf(default_skips[i]) == -1)
        skip_dirs.push(default_skips[i]);

    skip_dirs = skip_dirs.filter(e => e !== 'logs'); // remove 'logs' from blacklist!

    winston.info(`[${server_name}] Using skipDirEntryPatterns: ${skip_dirs}`);

    this.configFileWatcher = watch(this.instance.env.cwd, {ignored: skip_dirs});
    this.configFileWatcher.add('**/server.properties');
    this.configFileWatcher.add('**/server.config');
    this.configFileWatcher.add('**/cron.config');
    this.configFileWatcher.add('**/eula.txt');
    this.configFileWatcher.add('**/server-icon.png');
    this.configFileWatcher.add('**/config.yml');


    this.configFileWatcher.on('add', this.handle_event);
    this.configFileWatcher.on('change', this.handle_event);


    this.instance.crons((err, cron_dict) => {
      for (let cronhash in cron_dict) {
        if (cron_dict[cronhash].enabled) {
          try {
            this.cron[cronhash] = new CronJob({
              cronTime: cron_dict[cronhash].source,
              onTick: () => this.cron_dispatcher(this),
              start: true,
              context: cron_dict[cronhash]
            });
          } catch (e) {
            // catches invalid cron expressions
            winston.warn(`[${server_name}] invalid cron expression:`, cronhash, cron_dict[cronhash]);
            this.instance.set_cron(cronhash, false, function () {
            });
          }
        }
      }
    })
  }

  cron_dispatcher(args) {
    let fn, required_args;
    const arg_array: any[] = [];

    fn = this.instance[args.command];
    required_args = introspect(fn);

    for (let i in required_args) {
      // all callbacks expected to follow the pattern (success, payload).
      if (required_args[i] == 'callback')
        arg_array.push((err, _) => {
          args.success = !err;
          args.err = err;
          args.time_resolved = Date.now();
          if (err)
            winston.error(`[${this.server_name}] command "${args.command}" errored out:`, args);
        })
      else if (required_args[i] in args) {
        arg_array.push(args[required_args[i]])
      }
    }

    fn.apply(this.instance, arg_array);
  }

  heartbeat() {
    console.log("creating heartbeat...")
    clearInterval(this.intervals['heartbeat']);
    this.intervals['heartbeat'] = setInterval(this.heartbeat, this.HEARTBEAT_INTERVAL_MS * 3);

    async.parallel({
      'up': cb => {
        this.instance.property('up', function (err, is_up) {
          cb(null, is_up)
        })
      },
      'memory': cb => {
        this.instance.property('memory', function (err, mem) {
          cb(null, err ? {} : mem)
        })
      },
      'ping': cb => {
        this.instance.property('unconventional', (err, is_unconventional) => {
          if (is_unconventional)
            cb(null, {}); //ignore ping--wouldn't respond in any meaningful way
          else
            this.instance.property('ping', (err, ping) => {
              cb(null, err ? {} : ping)
            })
        })
      },
      'query': cb => {
        this.instance.property('server.properties', (err, dict) => {
          if ((dict || {})['enable-query'])
            this.instance.property('query', cb);
          else
            cb(null, {}); //ignore query--wouldn't respond in any meaningful way
        })
      }
    }, (err, retval) => {
      clearInterval(this.intervals['heartbeat']);
      this.intervals['heartbeat'] = setInterval(this.heartbeat, this.HEARTBEAT_INTERVAL_MS);

      this.nsp.emit('heartbeat', {
        'server_name': this.server_name,
        'timestamp': Date.now(),
        'payload': retval
      })
    })
  }

  world_committer() {
    async.waterfall([
      async.apply(this.instance.property, 'commit_interval'),
      (minutes, _) => {
        if (minutes !== this.COMMIT_INTERVAL_MIN) { //upon change or init
          this.COMMIT_INTERVAL_MIN = minutes;
          if (minutes > 0) {
            winston.info(`[${this.server_name}] committing world to disk every ${minutes} minutes.`);
            this.intervals['commit'] = setInterval(this.instance.saveall, minutes * 60 * 1000);
          } else {
            winston.info(`[${this.server_name}] not committing world to disk automatically (interval set to ${minutes})`);
            clearInterval(this.intervals['commit']);
          }
        }
      }
    ])
  }

  private handle_event(fp) {
    // because it is unknown when fw triggers on add/change and
    // further because if it catches DURING the write, it will find
    // the file has 0 size, adding arbitrary delay.
    // process.nexttick didnt work.
    const FS_DELAY = 250;
    const file_name = path.basename(fp);
    switch (file_name) {
      case 'server.properties':
        setTimeout(this.broadcast_sp, FS_DELAY);
        break;
      case 'server.config':
        setTimeout(this.broadcast_sc, FS_DELAY);
        break;
      case 'cron.config':
        setTimeout(this.broadcast_cc, FS_DELAY);
        break;
      case 'eula.txt':
        setTimeout(this.emit_eula, FS_DELAY);
        break;
      case 'server-icon.png':
        setTimeout(this.broadcast_icon, FS_DELAY);
        break;
      case 'config.yml':
        setTimeout(this.broadcast_cy, FS_DELAY);
        break;
    }
  }

  emit_eula() {
    async.waterfall([
      async.apply(this.instance.property, 'eula'),
      (accepted, cb) => {
        winston.info(`[${this.server_name}] eula.txt detected: ${accepted ? 'ACCEPTED' : 'NOT YET ACCEPTED'} (eula=${accepted})`);
        this.nsp.emit('eula', accepted);
        cb();
      },
    ])
  }

  broadcast_icon() {
    // function to encode file data to base64 encoded string
    //http://www.hacksparrow.com/base64-encoding-decoding-in-node-js.html
    const filepath = path.join(this.instance.env.cwd, 'server-icon.png');
    fs.readFile(filepath, (err, data) => {
      if (!err && data.toString('hex', 0, 4) == '89504e47') //magic number for png first 4B
        this.nsp.emit('server-icon.png', Buffer.from(data).toString('base64'));
    });
  }

  broadcast_cy() {
    // function to broadcast raw config.yml from bungeecord
    const filepath = path.join(this.instance.env.cwd, 'config.yml');
    fs.readFile(filepath, (err, data) => {
      if (!err)
        this.nsp.emit('config.yml', Buffer.from(data).toString());
    });
  }

  broadcast_notices() {
    this.nsp.emit('notices', this.notices);
  }

  broadcast_sp() {
    this.instance.sp((err, sp_data) => {
      winston.debug(`[${this.server_name}] broadcasting server.properties`);
      this.nsp.emit('server.properties', sp_data);
    })
  }

  broadcast_sc() {
    this.instance.sc((err, sc_data) => {
      winston.debug(`[${this.server_name}] broadcasting server.config`);
      if (!err)
        this.nsp.emit('server.config', sc_data);
    })
  }

  broadcast_cc() {
    this.instance.crons((err, cc_data) => {
      winston.debug(`[${this.server_name}] broadcasting cron.config`);
      if (!err)
        this.nsp.emit('cron.config', cc_data);
    })
  }

  make_tail(rel_filepath) {
    const abs_filepath = path.join(this.instance.env.cwd, rel_filepath);

    if (rel_filepath in this.tails) {
      winston.warn(`[${this.server_name}] Tail already exists for ${rel_filepath}`);
      return;
    }

    try {
      const new_tail = new Tail(abs_filepath);
      winston.info(`[${this.server_name}] Created tail on ${rel_filepath}`);
      new_tail.on('line', data => {
        //logging.info('[${}] ${}: transmitting new tail data'.format(server_name, rel_filepath));
        this.nsp.emit('tail_data', {'filepath': rel_filepath, 'payload': data});
      })
      this.tails[rel_filepath] = new_tail;
    } catch (e: any) {
      winston.error(`[${this.server_name}] Create tail on ${rel_filepath} failed`);
      if (e.errno != -2) {
        winston.error(e);
        return; //exit execution to perhaps curb a runaway process
      }
      winston.info(`[${this.server_name}] Watching for file generation: ${rel_filepath}`);

      const default_skips = ['world', 'world_the_end', 'world_nether', 'dynmap', 'plugins', 'web', 'region', 'playerdata', 'stats', 'data'];
      this.makeTailFileWatcher = watch(this.instance.env.cwd, {ignored: default_skips});

      this.makeTailFileWatcher.add(`**/${rel_filepath}`);
      this.makeTailFileWatcher.on('add', fp => {
        if (abs_filepath === fp) {
          this.makeTailFileWatcher?.unwatch(fp);
          winston.info(`[${this.server_name}] ${path.basename(fp)} created! Watchfile ${rel_filepath} closed`);
          async.nextTick(() => this.make_tail(rel_filepath));
        }
      });
    }
  }

  broadcast_to_lan(callback) {
    async.waterfall([
      async.apply(this.instance.verify, 'exists'),
      async.apply(this.instance.verify, 'up'),
      async.apply(this.instance.sc),
      (sc_data, cb) => {
        const broadcast_value = (sc_data.minecraft || {}).broadcast;
        cb(!broadcast_value) //logically notted to make broadcast:true pass err cb
      },
      async.apply(this.instance.sp)
    ], function (err, sp_data: any) {
      if (err)
        callback(null);
      else {
        const msg = Buffer.from("[MOTD]" + sp_data.motd + "[/MOTD][AD]" + sp_data['server-port'] + "[/AD]");
        const server_ip = sp_data['server-ip'];
        callback(msg, server_ip);
      }
    })
  }

  onreboot_start(callback) {
    async.waterfall([
      async.apply(this.instance.property, 'onreboot_start'),
      (autostart, cb) => {
        winston.info(`[${this.server_name}] autostart = ${autostart}`);
        cb(!autostart); //logically NOT'ing so that autostart = true continues to next func
      },
      async.apply(this.instance.start)
    ], function (err) {
      callback(err);
    })
  }

  cleanup() {
    for (let t in this.tails) {
      this.tails[t].unwatch();
    }

    this.intervals.forEach(clearInterval);

    this.makeTailFileWatcher?.close();
    this.configFileWatcher?.close();
    this.nsp.removeAllListeners();
  }

  direct_dispatch(user, args) {
    let fn, required_args: any[];
    const arg_array: any[] = [];

    async.waterfall([
      async.apply(this.instance.property, 'owner'),
      function (ownership_data, cb) {
        auth.test_membership(user, ownership_data.groupname, function (is_valid) {
          cb(null, is_valid);
        });
      },
      function (is_valid, cb) {
        cb(!is_valid); //logical NOT'ted:  is_valid ? falsy error, !is_valid ? truthy error
      }
    ], err => {
      if (err) {
        winston.error(`User "${user}" does not have permissions on [${args.server_name}]:`, args);
      } else {
        try {
          fn = this.instance[args.command];
          required_args = introspect(fn);
          // receives an array of all expected arguments, using introspection.
          // they are in order as listed by the function definition, which makes iteration possible.
        } catch (e) {
          args.success = false;
          args.error = e;
          args.time_resolved = Date.now();
          this.nsp.emit('server_fin', args);
          winston.error('server_fin', args);

          return;
        }

        for (let i in required_args) {
          // all callbacks expected to follow the pattern (success, payload).
          if (required_args[i] == 'callback')
            arg_array.push((err, _) => {
              args.success = !err;
              args.err = err;
              args.time_resolved = Date.now();
              this.nsp.emit('server_fin', args);
              if (err)
                winston.error(`[${this.server_name}] command "${args.command}" errored out:`, args);
              winston.log('server_fin', args)
            })
          else if (required_args[i] in args) {
            arg_array.push(args[required_args[i]])
          } else {
            args.success = false;
            winston.error('Provided values missing required argument', required_args[i]);
            args.error = `Provided values missing required argument: ${required_args[i]}`;
            this.nsp.emit('server_fin', args);
            return;
          }
        }

        if (args.command == 'delete')
          this.cleanup();

        winston.info(`[${this.server_name}] received request "${args.command}"`)
        fn.apply(this.instance, arg_array);
      }
    })
  }

  initSocket() {
    this.nsp.on('connection', socket => {
      const ip_address = socket.request.connection.remoteAddress;
      const username = socket.request.user?.username;

      async.waterfall([
        async.apply(this.instance.property, 'owner'),
        (ownership_data, cb) => auth.test_membership(username, ownership_data.groupname, is_valid => cb(null, is_valid)),
        (is_valid, cb) => {
          cb(!is_valid); //logical NOT'ted:  is_valid ? falsy error, !is_valid ? truthy error
        }
      ], err => {
        if (err)
          socket.disconnect();
        else {
          winston.info(`[${this.server_name}] ${username} (${ip_address}) joined server namespace`);

          socket.on('command', this.produce_receipt);
          socket.on('get_file_contents', this.get_file_contents);
          socket.on('get_available_tails', this.get_available_tails);
          socket.on('property', this.get_prop);
          socket.on('page_data', this.get_page_data);
          socket.on('cron', this.manage_cron);
          socket.on('server.properties', this.broadcast_sp);
          socket.on('server.config', this.broadcast_sc);
          socket.on('cron.config', this.broadcast_cc);
          socket.on('server-icon.png', this.broadcast_icon);
          socket.on('config.yml', this.broadcast_cy);
          socket.on('req_server_activity', this.broadcast_notices);
        }
      })
    }) //nsp on connect container ends
  }

  server_dispatcher(args) {
    const NOTICES_QUEUE_LENGTH = 10; // 0 < q <= 10
    let fn, required_args;
    const arg_array: any[] = [];

    try {
      fn = this.instance[args.command];
      required_args = introspect(fn);
      // receives an array of all expected arguments, using introspection.
      // they are in order as listed by the function definition, which makes iteration possible.
    } catch (e) {
      args.success = false;
      args.error = e;
      args.time_resolved = Date.now();
      this.nsp.emit('server_fin', args);
      winston.error('server_fin', args);

      while (this.notices.length > NOTICES_QUEUE_LENGTH)
        this.notices.shift();
      this.notices.push(args);
      return;
    }

    for (let i in required_args) {
      // all callbacks expected to follow the pattern (success, payload).
      if (required_args[i] == 'callback')
        arg_array.push((err, _) => {
          args.success = !err;
          args.err = err;
          args.time_resolved = Date.now();
          this.nsp.emit('server_fin', args);
          if (err)
            winston.error(`[${this.server_name}] command "${args.command}" errored out:`, args);
          winston.log('server_fin', args)

          while (this.notices.length > NOTICES_QUEUE_LENGTH)
            this.notices.shift();

          if (args.command != 'delete')
            this.notices.push(args);
        })
      else if (required_args[i] in args) {
        arg_array.push(args[required_args[i]])
      } else {
        args.success = false;
        winston.error('Provided values missing required argument', required_args[i]);
        args.error = `Provided values missing required argument: ${required_args[i]}`;
        this.nsp.emit('server_fin', args);
        return;
      }
    }

    if (args.command == 'delete')
      this.cleanup();

    winston.info(`[${this.server_name}] received request "${args.command}"`)
    fn.apply(this.instance, arg_array);
  }

  produce_receipt(args, ip_address, username) {
    winston.info(`[${this.server_name}] ${ip_address} issued command : "${args.command}"`)
    args.uuid = uuid.v1();
    args.time_initiated = Date.now();
    this.nsp.emit('server_ack', args);

    switch (args.command) {
      case 'chown':
        async.waterfall([
          async.apply(this.instance.property, 'owner'),
          function (owner_data, cb) {
            if (owner_data.username !== username)
              cb('Only the current user owner may reassign server ownership.');
            else if (owner_data.uid != args.uid)
              cb('You may not change the user owner of the server.');
            else
              cb();
          }
        ], err => {
          if (err) {
            args.success = false;
            args.err = err;
            args.time_resolved = Date.now();
            winston.error(`[${this.server_name}] command "${args.command}" errored out:`, args);
            this.nsp.emit('server_fin', args);
          } else {
            this.server_dispatcher(args);
          }
        })
        break;
      default:
        this.server_dispatcher(args);
        break;
    }

  }

  get_file_contents(rel_filepath) {
    if (rel_filepath in this.tails) { //this is the protection from malicious client
      // a tail would only exist for a file the server itself has opened
      const abs_filepath = path.join(this.instance.env['cwd'], rel_filepath);
      const FILESIZE_LIMIT_THRESHOLD = 256000;

      async.waterfall([
        async.apply(fs.stat, abs_filepath),
        function (stat_data, cb) {
          cb(stat_data.size > FILESIZE_LIMIT_THRESHOLD)
        },
        async.apply(fs.readFile, abs_filepath),
        (data, cb) => {
          winston.info(`[${this.server_name}] transmittting existing file contents: ${rel_filepath} (${data.length} bytes)`);
          this.nsp.emit('file head', {filename: rel_filepath, payload: data.toString()});
          cb();
        }
      ], err => {
        if (err) {
          const msg = `File is too large (> ${FILESIZE_LIMIT_THRESHOLD / 1000} KB).  Only newly added lines will appear here.`;
          this.nsp.emit('file head', {filename: rel_filepath, payload: msg});
        }
      })
    }
  }

  get_available_tails() {
    for (const t in this.tails)
      this.get_file_contents(this.tails[t].filename.replace(this.instance.env.cwd + '/', ''));
  }

  get_prop(requested, ip_address) {
    winston.info(`[${this.server_name}] ${ip_address} requesting property: ${requested.property}`);
    this.instance.property(requested.property, (err, retval) => {
      winston.info(`[${this.server_name}] returned to ${ip_address}: ${retval}`);
      this.nsp.emit('server_fin', {'server_name': this.server_name, 'property': requested.property, 'payload': retval});
    })
  }

  get_page_data(page, username) {
    switch (page) {
      case 'glance':
        winston.debug(`[${this.server_name}] ${username} requesting server at a glance info`);

        async.parallel({
          'increments': async.apply(this.instance.list_increments),
          'archives': async.apply(this.instance.list_archives),
          'du_awd': async.apply(this.instance.property, 'du_awd'),
          'du_bwd': async.apply(this.instance.property, 'du_bwd'),
          'du_cwd': async.apply(this.instance.property, 'du_cwd'),
          'owner': async.apply(this.instance.property, 'owner'),
          'server_files': async.apply(this.instance.property, 'server_files'),
          'ftb_installer': async.apply(this.instance.property, 'FTBInstall.sh'),
          'eula': async.apply(this.instance.property, 'eula'),
          'base_dir': cb => {
            cb(null, this.user_config.base_directory)
          }
        }, (err, results) => {
          winston.error(`[${this.server_name}] Error with get_page_data`, err, results);
          this.nsp.emit('page_data', {page: page, payload: results});
        })
        break;
      default:
        this.nsp.emit('page_data', {page: page});
        break;
    }
  }

  manage_cron(opts, ip_address) {
    const reload_cron = callback => {
      for (let c in this.cron) {
        try {
          this.cron[c].stop();
        } catch (e) {
        }
      }
      this.cron = {};

      this.instance.crons((err, cron_dict) => {
        for (let cronhash in cron_dict) {
          if (cron_dict[cronhash].enabled) {
            try {
              this.cron[cronhash] = new CronJob({
                cronTime: cron_dict[cronhash].source,
                onTick: () => this.server_dispatcher(this),
                start: true,
                context: cron_dict[cronhash]
              });
            } catch (e) {
              //catches invalid cron pattern, disables cron
              winston.warn(`[${this.server_name}] ${ip_address} invalid cron expression submitted:`, cron_dict[cronhash].source);
              this.instance.set_cron(opts.hash, false, () => {
              });
            }
          }
        }
        callback();
      })
    };

    const operation = opts.operation;
    delete opts.operation;

    switch (operation) {
      case 'create':
        const cron_hash = hash(opts);
        winston.log(`[${this.server_name}] ${ip_address} requests cron creation:`, cron_hash, opts);

        opts['enabled'] = false;

        async.series([
          async.apply(this.instance.add_cron, cron_hash, opts),
          async.apply(reload_cron)
        ])
        break;
      case 'delete':
        winston.info(`[${this.server_name}] ${ip_address} requests cron deletion: ${opts.hash}`);

        try {
          this.cron[opts.hash].stop();
        } catch (e) {
        }

        try {
          delete this.cron[opts.hash];
        } catch (e) {
        }

        async.series([
          async.apply(this.instance.delete_cron, opts.hash),
          async.apply(reload_cron)
        ])
        break;
      case 'start':
        winston.info(`[${this.server_name}] ${ip_address} starting cron: ${opts.hash}`);

        async.series([
          async.apply(this.instance.set_cron, opts.hash, true),
          async.apply(reload_cron)
        ])
        break;
      case 'suspend':
        winston.info(`[${this.server_name}] ${ip_address} suspending cron: ${opts.hash}`);

        async.series([
          async.apply(this.instance.set_cron, opts.hash, false),
          async.apply(reload_cron)
        ])
        break;
      default:
        winston.warn(`[${this.server_name}] ${ip_address} requested unexpected cron operation: ${operation}`, opts);
    }
  }
}