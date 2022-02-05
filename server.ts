import { MINE_OS } from "./mineos";
import async from "async";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { constants } from "fs";
import procfs from "procfs-stats";
import which from "which";
import profiles_const from "./profiles.d/profiles"
import dgram from "dgram";
import fireworm from "fireworm";
import userid from "userid";
import introspect from "introspect";
import { CronJob } from "cron";
import { Tail } from "tail";
import auth from "./auth";
import request from "request";
import progress from "request-progress";
import unzip from "unzipper";
import admzip from "adm-zip";
import hash from "object-hash";
import rsync from "rsync";
import uuid from "node-uuid";
import child_process from "child_process";
import winston from "winston";

import passwd from "etc-passwd";
import { Server } from "socket.io";


winston.add(new winston.transports.File({
  filename: '/var/log/mineos.log',
  handleExceptions: true
}));

export const backend = function (this: any, base_dir: string, socket_emitter: Server, user_config: { creators?: string; }): void {
  const self = this;

  self.servers = {};
  self.profiles = [];
  self.front_end = socket_emitter;
  self.commit_msg = '';

  process.umask(0o002);

  fs.ensureDirSync(base_dir);
  fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['servers']));
  fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['backup']));
  fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['archive']));
  fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['import']));
  fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['profiles']));

  fs.chmod(path.join(base_dir, MINE_OS.DIRS['import']), 0o777);

  function initUdpBroadcaster() {
    const udp_broadcaster = {};
    const UDP_DEST = '255.255.255.255';
    const UDP_PORT = 4445;
    const BROADCAST_DELAY_MS = 4000;

    async.forever(
      next => {
        for (let s in self.servers) {
          self.servers[s].broadcast_to_lan(function (msg, server_ip) {
            if (msg) {
              if (udp_broadcaster[server_ip]) {
                udp_broadcaster[server_ip].send(msg, 0, msg.length, UDP_PORT, UDP_DEST);
              } else {
                udp_broadcaster[server_ip] = dgram.createSocket('udp4');
                udp_broadcaster[server_ip].bind(UDP_PORT, server_ip);
                udp_broadcaster[server_ip].on("listening", function () {
                  udp_broadcaster[server_ip].setBroadcast(true);
                  udp_broadcaster[server_ip].send(msg, 0, msg.length, UDP_PORT, UDP_DEST);
                });
                udp_broadcaster[server_ip].on("error", () => {
                  winston.error("Cannot bind broadcaster to ip " + server_ip);
                });
              }
            }
          })
        }
        setTimeout(next, BROADCAST_DELAY_MS);
      },
      (err) => console.log(err)
    );
  }

  function initHeartbeat() {
    const HOST_HEARTBEAT_DELAY_MS = 1000;

    function host_heartbeat() {
      // @ts-ignore types do not include procfs.meminfo call...
      procfs.meminfo((err, meminfo) => {
        self.front_end.emit('host_heartbeat', {
          'uptime': os.uptime(),
          'freemem': ((meminfo && meminfo.MemAvailable) ? Number(meminfo.MemAvailable) * 1024 : os.freemem()),
          'loadavg': os.loadavg()
        })
      })
    }

    setInterval(host_heartbeat, HOST_HEARTBEAT_DELAY_MS);
  }

  function initServerDiscovery() {
    const server_path = path.join(base_dir, MINE_OS.DIRS['servers']);

    function discover() {
      //http://stackoverflow.com/a/24594123/1191579
      return fs.readdirSync(server_path).filter(function (p) {
        try {
          return fs.statSync(path.join(server_path, p)).isDirectory();
        } catch (e) {
          winston.warn(`Filepath ${path.join(server_path, p)} does not point to an existing directory`);
        }
      });
    }

    function track(sn) {
      self.servers[sn] = null;
      //if new server_container() isn't instant, double broadcast might trigger this if/then twice
      //setting to null is immediate and prevents double execution
      self.servers[sn] = new server_container(sn, user_config, self.front_end);
      self.front_end.emit('track_server', sn);
    }

    function untrack(sn) {
      try {
        self.servers[sn].cleanup();
        delete self.servers[sn];
      } catch (e) {
        //if server has already been deleted and this is running for reasons unknown, catch and ignore
      } finally {
        self.front_end.emit('untrack_server', sn);
      }
    }

    const discovered_servers = discover();
    for (var i in discovered_servers)
      track(discovered_servers[i]);

    fs.watch(server_path, function () {
      const current_servers = discover();

      for (let i in current_servers)
        if (!(current_servers[i] in self.servers)) //if detected directory not a discovered server, track
          track(current_servers[i]);

      for (let s in self.servers)
        if (current_servers.indexOf(s) < 0)
          untrack(s);

    })
  }

  function initFirewormWatcher() {
    const importable_archives = path.join(base_dir, MINE_OS.DIRS['import']);
    const fw = fireworm(importable_archives);
    fw.add('**/*.zip');
    fw.add('**/*.tar');
    fw.add('**/*.tgz');
    fw.add('**/*.tar.gz');

    fw
      .on('add', function (fp) {
        winston.info('[WEBUI] New file found in import directory', fp);
        self.send_importable_list();
      })
      .on('remove', function (fp) {
        winston.info('[WEBUI] File removed from import directory', fp);
        self.send_importable_list();
      })
  }

  initUdpBroadcaster();
  initHeartbeat();
  initServerDiscovery();
  initFirewormWatcher();


  self.start_servers = function () {
    const MS_TO_PAUSE = 10000;

    async.eachLimit(
      Object.keys(self.servers),
      1,
      function (server_name, callback) {
        self.servers[server_name].onreboot_start(function (err) {
          if (err)
            winston.error(`[${server_name}] Aborted server startup; condition not met: `, err);
          else
            winston.info(`[${server_name}] Server started. Waiting ${MS_TO_PAUSE} ms...`);

          setTimeout(callback, (err ? 1 : MS_TO_PAUSE));
        });
      },
      () => {
      }
    )
  }

  setTimeout(self.start_servers, 5000);

  self.shutdown = function () {
    for (let server_name in self.servers)
      self.servers[server_name].cleanup();
  }

  self.send_profile_list = function (send_existing) {
    if (send_existing && self.profiles.length) //if requesting to just send what you already have AND they are already present
      self.front_end.emit('profile_list', self.profiles);
    else {
      const profile_dir = path.join(base_dir, MINE_OS.DIRS['profiles']);
      const SIMULTANEOUS_DOWNLOADS = 3;
      let SOURCES = profiles_const.profile_manifests;
      let profiles: any = [];

      async.forEachOfLimit(
        SOURCES,
        SIMULTANEOUS_DOWNLOADS,
        (collection, key, outer_cb) => {
          if ('request_args' in collection) {
            async.waterfall([
              async.apply(request, collection.request_args),
              (response, body, cb) => cb(response.statusCode != 200, body),
              (body, cb) => collection.handler(profile_dir, body, cb)
            ], (err, output: any) => {
              if (!err && typeof output !== "undefined" && output && output.length !== undefined) {
                winston.info(`Downloaded information for collection: ${collection.name} (${output.length} entries)`);
                profiles = profiles.concat(output);
              } else {
                winston.error(`Unable to retrieve profile: ${key}. The definition for this profile may be improperly formed or is pointing to an invalid URI.`);
              }
              outer_cb();
            }); //end waterfall
          } else { //for profiles like paperspigot which are hardcoded
            async.waterfall([
              cb => collection.handler(profile_dir, undefined, cb)
            ], (err, output: any) => {
              if (!err && typeof output !== 'undefined' && output && output.length !== undefined) {
                winston.info(`Downloaded information for collection: ${collection.name} (${output.length} entries)`);
                profiles = profiles.concat(output);
              } else {
                winston.error(`Unable to retrieve profile: ${key}. The definition for this profile may be improperly formed or is pointing to an invalid URI.`);
              }
              outer_cb();
            }); //end waterfall
          }
        },
        function (err) {
          console.error(err);
          self.profiles = profiles;
          self.front_end.emit('profile_list', self.profiles);
        }
      ) //end forEachOfLimit
    }
  }

  self.send_spigot_list = function () {
    const profiles_dir = path.join(base_dir, MINE_OS.DIRS['profiles']);
    const spigot_profiles = {};

    async.waterfall([
      async.apply(fs.readdir, profiles_dir),
      function (listing, cb) {
        for (let i in listing) {
          const match = listing[i].match(/(paper)?spigot_([\d.]+)/);
          if (match)
            spigot_profiles[match[0]] = {
              'directory': match[0],
              'jarfiles': fs.readdirSync(path.join(profiles_dir, match[0])).filter(function (a) {
                return a.match(/.+\.jar/i)
              })
            }
        }
        cb();
      }
    ], () => {
      self.front_end.emit('spigot_list', spigot_profiles);
    })
  }

  self.send_locale_list = function () {
    async.waterfall([
      async.apply(fs.readdir, path.join(__dirname, 'html', 'locales')),
      (locale_paths: string[], cb) => {
        const locales = ["de", "en", "fr", "it", "ja", "no", "ru", "sv"];
        cb(null, locales);
      }
    ], (err, output) => {
      winston.info(output);
      if (!err)
        self.front_end.emit('locale_list', output);
      else
        self.front_end.emit('locale_list', ['en_US']);
    })
  }

  self.front_end.on('connection', function (socket) {
    const ip_address = socket.request.connection.remoteAddress;
    const username = socket.request.user.username;

    const OWNER_CREDS = {
      uid: userid.uid(username),
      gid: userid.gids(username)[0]
    };

    function webui_dispatcher(args) {
      winston.info(`[WEBUI] Received emit command from ${ip_address}:${username}`, args);
      let instance;
      let spigot_path;
      let dest_path;
      switch (args.command) {
        case 'create':
          instance = new MINE_OS.mc(args.server_name, base_dir);

          async.series([
            async.apply(instance.verify, '!exists'),
            function (cb) {
              let whitelisted_creators = [username]; //by default, accept create attempt by current user
              if ((user_config || {}).creators) {  //if creators key:value pair exists, use it
                whitelisted_creators = user_config['creators']?.split(',') ?? [];
                whitelisted_creators = whitelisted_creators.filter(function (e) {
                  return e
                }); //remove non-truthy entries like ''
                whitelisted_creators = whitelisted_creators.map(function (e) {
                  return e.trim()
                }); //remove trailing and tailing whitespace

                winston.info('Explicitly authorized server creators are:', whitelisted_creators);
              }
              cb(null, !(whitelisted_creators.indexOf(username) >= 0))
            },
            async.apply(instance.create, OWNER_CREDS),
            async.apply(instance.overlay_sp, args.properties),
          ], function (err, _) {
            if (!err)
              winston.info(`[${args.server_name}] Server created in filesystem.`);
            else {
              winston.info(`[${args.server_name}] Failed to create server in filesystem as user ${username}.`);
              winston.error(err);
            }
          })
          break;
        case 'create_unconventional_server':
          instance = new MINE_OS.mc(args.server_name, base_dir);

          async.series([
            async.apply(instance.verify, '!exists'),
            async.apply(instance.create_unconventional_server, OWNER_CREDS),
          ], function (err, _) {
            if (!err)
              winston.info(`[${args.server_name}] Server (unconventional) created in filesystem.`);
            else
              winston.error(err);
          })
          break;
        case 'download':
          for (let idx in self.profiles) {
            if (self.profiles[idx].id == args.profile.id) {
              const SOURCES = profiles_const.profile_manifests;
              const profile_dir = path.join(base_dir, 'profiles', args.profile.id);
              const dest_filepath = path.join(profile_dir, args.profile.filename);

              async.series([
                async.apply(fs.ensureDir, profile_dir),
                function (cb) {
                  progress(request({url: args.profile.url, headers: {'User-Agent': 'MineOS-node'}}), {
                    throttle: 250,
                    delay: 100
                  })
                    .on('error', function (err) {
                      winston.error(err);
                    })
                    .on('progress', function (state) {
                      args.profile.progress = state;
                      self.front_end.emit('file_progress', args.profile);
                    })
                    .on('complete', function (response) {
                      if (response.statusCode == 200) {
                        winston.info(`[WEBUI] Successfully downloaded ${args.profile.url} to ${dest_filepath}`);
                      } else {
                        winston.error('[WEBUI] Server was unable to download file:', args.profile.url);
                        winston.error(`[WEBUI] Remote server returned status ${response.statusCode} with headers:`, response.headers);
                      }
                      cb(null, response.statusCode != 200);
                    })
                    .pipe(fs.createWriteStream(dest_filepath))
                },
                function (cb) {
                  switch (path.extname(args.profile.filename).toLowerCase()) {
                    case '.jar':
                      cb();
                      break;
                    case '.zip':
                      fs.createReadStream(dest_filepath)
                        .pipe(unzip.Extract({path: profile_dir})
                          .on('close', function () {
                            cb()
                          })
                          .on('error', function () {
                            const zip = new admzip(dest_filepath);
                            zip.extractAllTo(profile_dir, true); //true => overwrite
                            cb();
                          })
                        );
                      break;
                    default:
                      cb();
                      break;
                  }
                },
                function (cb) {
                  // wide-area net try/catch. addressing issue of multiple simultaneous downloads.
                  // current theory: if multiple downloads occuring, and one finishes, forcing a
                  // redownload of profiles, SOURCES might be empty/lacking the unfinished dl.
                  // opting for full try/catch around postdownload to gracefully handle profile errors
                  try {
                    if ('postdownload' in SOURCES[args.profile['group']])
                      SOURCES[args.profile['group']].postdownload?.(profile_dir, dest_filepath, cb);
                    else
                      cb();
                  } catch (e) {
                    winston.error('simultaneous download race condition means postdownload hook may not have executed. redownload the profile to ensure proper operation.');
                    cb();
                  }
                }
              ], () => {
                self.send_profile_list();
              })
              break;
            }
          }
          break;
        case 'build_jar':
          let working_dir, bt_path, params;
          try {
            const profile_path = path.join(base_dir, MINE_OS.DIRS['profiles']);
            working_dir = path.join(profile_path, `${args.builder.group}_${args.version}`);
            bt_path = path.join(profile_path, args.builder.id, args.builder.filename);
            dest_path = path.join(working_dir, args.builder.filename);
            params = {cwd: working_dir};
          } catch (e) {
            winston.error('[WEBUI] Could not build jar; insufficient/incorrect arguments provided:', args);
            winston.error(e);
            return;
          }

          async.series([
            async.apply(fs.mkdir, working_dir),
            async.apply(fs.copy, bt_path, dest_path),
            function (cb) {
              const binary = which.sync('java');
              const proc = child_process.spawn(binary, ['-Xms512M', '-jar', dest_path, '--rev', args.version], params);

              proc.stdout.on('data', function (data) {
                self.front_end.emit('build_jar_output', data.toString());
                //logging.log('stdout: ' + data);
              });

              winston.info('[WEBUI] BuildTools starting with arguments:', args)

              proc.stderr.on('data', function (data) {
                self.front_end.emit('build_jar_output', data.toString());
                winston.error('stderr: ' + data);
              });

              proc.on('close', function (code) {
                cb(null, code);
              });
            }
          ], err => {
            winston.info(`[WEBUI] BuildTools jar compilation finished ${err ? 'unsuccessfully' : 'successfully'} in ${working_dir}`);
            winston.info(`[WEBUI] Buildtools used: ${dest_path}`);

            const retval = {
              'command': 'BuildTools jar compilation',
              'success': true,
              'help_text': ''
            };

            if (err) {
              retval['success'] = false;
              retval['help_text'] = `Error ${err.name}: (${err.message}): ${err.stack}`;
            }

            self.front_end.emit('host_notice', retval);
            self.send_spigot_list();
          })
          break;
        case 'delete_build':
          if (args.type == 'spigot')
            spigot_path = path.join(base_dir, MINE_OS.DIRS['profiles'], 'spigot_' + args.version);
          else {
            winston.error('[WEBUI] Unknown type of craftbukkit server -- potential modified webui request?');
            return;
          }

          fs.remove(spigot_path, function (err) {
            const retval = {
              'command': 'Delete BuildTools jar',
              'success': true,
              'help_text': ''
            };

            if (err) {
              retval['success'] = false;
              retval['help_text'] = `Error ${err}`;
            }

            self.front_end.emit('host_notice', retval);
            self.send_spigot_list();
          })
          break;
        case 'copy_to_server':
          if (args.type == 'spigot')
            spigot_path = path.join(base_dir, MINE_OS.DIRS['profiles'], 'spigot_' + args.version) + '/';
          else {
            winston.error('[WEBUI] Unknown type of craftbukkit server -- potential modified webui request?');
            return;
          }
          dest_path = path.join(base_dir, MINE_OS.DIRS['servers'], args.server_name) + '/';

          const obj = rsync.build({
            source: spigot_path,
            destination: dest_path,
            flags: 'au',
            shell: 'ssh'
          });

          obj.set('--include', '*.jar');
          obj.set('--exclude', '*');
          obj.set('--prune-empty-dirs');
          obj.set('--chown', `${OWNER_CREDS.uid}:${OWNER_CREDS.gid}`);

          obj.execute((error, code) => {
            const retval = {
              'command': 'BuildTools jar copy',
              'success': true,
              'help_text': ''
            };

            if (error) {
              retval['success'] = false;
              retval['help_text'] = `Error ${error} (${code})`;
            }

            self.front_end.emit('host_notice', retval);
            for (let s in self.servers)
              self.front_end.emit('track_server', s);
          });

          break;
        case 'refresh_server_list':
          for (var s in self.servers)
            self.front_end.emit('track_server', s);
          break;
        case 'refresh_profile_list':
          self.send_profile_list();
          self.send_spigot_list();
          break;
        case 'create_from_archive':
          instance = new MINE_OS.mc(args.new_server_name, base_dir);

          let filepath;
          if (args.awd_dir)
            filepath = path.join(instance.env.base_dir, MINE_OS.DIRS['archive'], args.awd_dir, args.filename);
          else
            filepath = path.join(instance.env.base_dir, MINE_OS.DIRS['import'], args.filename);

          async.series([
            async.apply(instance.verify, '!exists'),
            async.apply(instance.create_from_archive, OWNER_CREDS, filepath)
          ], function (err, _) {
            if (!err) {
              winston.info(`[${args.new_server_name}] Server created in filesystem.`);
              setTimeout(function () {
                self.front_end.emit('track_server', args.new_server_name)
              }, 1000);
            } else
              winston.error(err);
          })
          break;
        default:
          winston.warn(`Command ignored: no such command ${args.command}`);
          break;
      }
    }

    self.send_user_list = function () {
      const users: any[] = [];
      const groups: any[] = [];

      passwd.getUsers()
        .on('user', function (user_data) {
          if (user_data.username == username)
            users.push({
              username: user_data.username,
              uid: user_data.uid,
              gid: user_data.gid,
              home: user_data.home
            })
        })
        .on('end', function () {
          socket.emit('user_list', users);
        });

      passwd.getGroups()
        .on('group', function (group_data) {
          if (group_data.users.indexOf(username) >= 0 || group_data.gid == userid.gids(username)[0]) {
            if (group_data.gid > 0) {
              groups.push({
                groupname: group_data.groupname,
                gid: group_data.gid
              })
            }
          }
        })
        .on('end', function () {
          socket.emit('group_list', groups);
        });
    }

    winston.info(`[WEBUI] ${username} connected from ${ip_address}`);
    socket.emit('whoami', username);
    socket.emit('commit_msg', self.commit_msg);
    socket.emit('change_locale', (user_config || {})['webui_locale']);
    socket.emit('optional_columns', (user_config || {})['optional_columns']);

    for (let server_name in self.servers)
      socket.emit('track_server', server_name);

    socket.on('command', webui_dispatcher);
    self.send_user_list();
    self.send_profile_list(true);
    self.send_spigot_list();
    self.send_importable_list();
    self.send_locale_list();

  })

  self.send_importable_list = function () {
    const importable_archives = path.join(base_dir, MINE_OS.DIRS['import']);
    const all_info: any[] = [];

    fs.readdir(importable_archives, function (err, files) {
      if (!err) {
        const fullpath = files.map(function (value, index) {
          return path.join(importable_archives, value);
        });

        const stat = fs.stat;
        async.map<any, any>(fullpath, stat, (inner_err, results) => {
          results?.forEach((value, index) => {
            all_info.push({
              time: value?.mtime,
              size: value?.size,
              filename: files[index]
            })
          })

          all_info.sort(function (a, b) {
            return a.time.getTime() - b.time.getTime();
          });

          self.front_end.emit('archive_list', all_info);
        });
      }
    })
  }

  return self;
}

function server_container(this: any, server_name, user_config, socket_io) {
  // when evoked, creates a permanent 'mc' instance, namespace, and place for file tails.
  const self: any = this;
  const instance = new MINE_OS.mc(server_name, user_config.base_directory),
    nsp = socket_io.of(`/${server_name}`),
    tails = {},
    notices: any[] = [];
  let cron = {};
  const intervals = {},
    HEARTBEAT_INTERVAL_MS = 5000;
  let COMMIT_INTERVAL_MIN = null;

  winston.info(`[${server_name}] Discovered server`);

  // check that awd and bwd also exist alongside cwd or create and chown
  let missing_dir = false;
  try {
    fs.accessSync(instance.env.bwd, constants.F_OK)
  } catch (e) {
    missing_dir = true
  }
  try {
    fs.accessSync(instance.env.awd, constants.F_OK)
  } catch (e) {
    missing_dir = true
  }

  if (missing_dir) {
    async.series([
      async.apply(fs.ensureDir, instance.env.bwd),
      async.apply(fs.ensureDir, instance.env.awd),
      async.apply(instance.sync_chown)
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

  for (var i in files_to_tail)
    make_tail(files_to_tail[i]);

  (function () {
    let skip_dirs = fs.readdirSync(instance.env.cwd).filter(function (p) {
      try {
        return fs.statSync(path.join(instance.env.cwd, p)).isDirectory();
      } catch (e) {
        winston.error(e);
        return false;
      }
    });

    const default_skips = ['world', 'world_the_end', 'world_nether', 'dynmap', 'plugins', 'web', 'region', 'playerdata', 'stats', 'data'];
    for (let i in default_skips)
      if (skip_dirs.indexOf(default_skips[i]) == -1)
        skip_dirs.push(default_skips[i]);

    skip_dirs = skip_dirs.filter(function (e) {
      return e !== 'logs'
    }); // remove 'logs' from blacklist!

    winston.info(`[${server_name}] Using skipDirEntryPatterns: ${skip_dirs}`);

    const fw = fireworm(instance.env.cwd, {skipDirEntryPatterns: skip_dirs});

    for (let i in skip_dirs) {
      fw.ignore(skip_dirs[i]);
    }
    fw.add('**/server.properties');
    fw.add('**/server.config');
    fw.add('**/cron.config');
    fw.add('**/eula.txt');
    fw.add('**/server-icon.png');
    fw.add('**/config.yml');

    const FS_DELAY = 250;

    function handle_event(fp) {
      // because it is unknown when fw triggers on add/change and
      // further because if it catches DURING the write, it will find
      // the file has 0 size, adding arbitrary delay.
      // process.nexttick didnt work.
      const file_name = path.basename(fp);
      switch (file_name) {
        case 'server.properties':
          setTimeout(broadcast_sp, FS_DELAY);
          break;
        case 'server.config':
          setTimeout(broadcast_sc, FS_DELAY);
          break;
        case 'cron.config':
          setTimeout(broadcast_cc, FS_DELAY);
          break;
        case 'eula.txt':
          setTimeout(emit_eula, FS_DELAY);
          break;
        case 'server-icon.png':
          setTimeout(broadcast_icon, FS_DELAY);
          break;
        case 'config.yml':
          setTimeout(broadcast_cy, FS_DELAY);
          break;
      }
    }

    fw.on('add', handle_event);
    fw.on('change', handle_event);
  })();

  intervals['heartbeat'] = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  function heartbeat() {
    console.log("creating heartbeat...")
    clearInterval(intervals['heartbeat']);
    intervals['heartbeat'] = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS * 3);

    async.parallel({
      'up': function (cb) {
        instance.property('up', function (err, is_up) {
          cb(null, is_up)
        })
      },
      'memory': function (cb) {
        instance.property('memory', function (err, mem) {
          cb(null, err ? {} : mem)
        })
      },
      'ping': function (cb) {
        instance.property('unconventional', function (err, is_unconventional) {
          if (is_unconventional)
            cb(null, {}); //ignore ping--wouldn't respond in any meaningful way
          else
            instance.property('ping', function (err, ping) {
              cb(null, err ? {} : ping)
            })
        })
      },
      'query': function (cb) {
        instance.property('server.properties', function (err, dict) {
          if ((dict || {})['enable-query'])
            instance.property('query', cb);
          else
            cb(null, {}); //ignore query--wouldn't respond in any meaningful way
        })
      }
    }, function (err, retval) {
      clearInterval(intervals['heartbeat']);
      intervals['heartbeat'] = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

      nsp.emit('heartbeat', {
        'server_name': server_name,
        'timestamp': Date.now(),
        'payload': retval
      })
    })
  }

  intervals['world_commit'] = setInterval(world_committer, 60 * 1000);

  function world_committer() {
    async.waterfall([
      async.apply(instance.property, 'commit_interval'),
      function (minutes, _) {
        if (minutes != COMMIT_INTERVAL_MIN) { //upon change or init
          COMMIT_INTERVAL_MIN = minutes;
          if (minutes > 0) {
            winston.info(`[${server_name}] committing world to disk every ${minutes} minutes.`);
            intervals['commit'] = setInterval(instance.saveall, minutes * 60 * 1000);
          } else {
            winston.info(`[${server_name}] not committing world to disk automatically (interval set to ${minutes})`);
            clearInterval(intervals['commit']);
          }
        }
      }
    ])
  }

  (function () {
    function cron_dispatcher(args) {
      let fn, required_args;
      const arg_array: any[] = [];

      fn = instance[args.command];
      required_args = introspect(fn);

      for (let i in required_args) {
        // all callbacks expected to follow the pattern (success, payload).
        if (required_args[i] == 'callback')
          arg_array.push((err, _) => {
            args.success = !err;
            args.err = err;
            args.time_resolved = Date.now();
            if (err)
              winston.error(`[${server_name}] command "${args.command}" errored out:`, args);
          })
        else if (required_args[i] in args) {
          arg_array.push(args[required_args[i]])
        }
      }

      fn.apply(instance, arg_array);
    }

    instance.crons(function (err, cron_dict) {
      for (let cronhash in cron_dict) {
        if (cron_dict[cronhash].enabled) {
          try {
            cron[cronhash] = new CronJob({
              cronTime: cron_dict[cronhash].source,
              onTick: function () {
                cron_dispatcher(this);
              },
              start: true,
              context: cron_dict[cronhash]
            });
          } catch (e) {
            // catches invalid cron expressions
            winston.warn(`[${server_name}] invalid cron expression:`, cronhash, cron_dict[cronhash]);
            instance.set_cron(cronhash, false, function () {
            });
          }
        }
      }
    })
  })();

  self.broadcast_to_lan = function (callback) {
    async.waterfall([
      async.apply(instance.verify, 'exists'),
      async.apply(instance.verify, 'up'),
      async.apply(instance.sc),
      function (sc_data, cb) {
        const broadcast_value = (sc_data.minecraft || {}).broadcast;
        cb(!broadcast_value) //logically notted to make broadcast:true pass err cb
      },
      async.apply(instance.sp)
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

  self.onreboot_start = function (callback) {
    async.waterfall([
      async.apply(instance.property, 'onreboot_start'),
      function (autostart, cb) {
        winston.info(`[${server_name}] autostart = ${autostart}`);
        cb(!autostart); //logically NOT'ing so that autostart = true continues to next func
      },
      async.apply(instance.start)
    ], function (err) {
      callback(err);
    })
  }

  self.cleanup = function () {
    for (let t in tails)
      tails[t].unwatch();

    for (let i in intervals)
      clearInterval(intervals[i]);

    nsp.removeAllListeners();
  }

  function emit_eula() {
    async.waterfall([
      async.apply(instance.property, 'eula'),
      function (accepted, cb) {
        winston.info(`[${server_name}] eula.txt detected: ${accepted ? 'ACCEPTED' : 'NOT YET ACCEPTED'} (eula=${accepted})`);
        nsp.emit('eula', accepted);
        cb();
      },
    ])
  }

  function broadcast_icon() {
    // function to encode file data to base64 encoded string
    //http://www.hacksparrow.com/base64-encoding-decoding-in-node-js.html
    const filepath = path.join(instance.env.cwd, 'server-icon.png');
    fs.readFile(filepath, function (err, data) {
      if (!err && data.toString('hex', 0, 4) == '89504e47') //magic number for png first 4B
        nsp.emit('server-icon.png', Buffer.from(data).toString('base64'));
    });
  }

  function broadcast_cy() {
    // function to broadcast raw config.yml from bungeecord
    const filepath = path.join(instance.env.cwd, 'config.yml');
    fs.readFile(filepath, function (err, data) {
      if (!err)
        nsp.emit('config.yml', Buffer.from(data).toString());
    });
  }

  function broadcast_notices() {
    nsp.emit('notices', notices);
  }

  function broadcast_sp() {
    instance.sp(function (err, sp_data) {
      winston.debug(`[${server_name}] broadcasting server.properties`);
      nsp.emit('server.properties', sp_data);
    })
  }

  function broadcast_sc() {
    instance.sc(function (err, sc_data) {
      winston.debug(`[${server_name}] broadcasting server.config`);
      if (!err)
        nsp.emit('server.config', sc_data);
    })
  }

  function broadcast_cc() {
    instance.crons(function (err, cc_data) {
      winston.debug(`[${server_name}] broadcasting cron.config`);
      if (!err)
        nsp.emit('cron.config', cc_data);
    })
  }

  function make_tail(rel_filepath) {
    const abs_filepath = path.join(instance.env.cwd, rel_filepath);

    if (rel_filepath in tails) {
      winston.warn(`[${server_name}] Tail already exists for ${rel_filepath}`);
      return;
    }

    try {
      const new_tail = new Tail(abs_filepath);
      winston.info(`[${server_name}] Created tail on ${rel_filepath}`);
      new_tail.on('line', function (data) {
        //logging.info('[${}] ${}: transmitting new tail data'.format(server_name, rel_filepath));
        nsp.emit('tail_data', {'filepath': rel_filepath, 'payload': data});
      })
      tails[rel_filepath] = new_tail;
    } catch (e: any) {
      winston.error(`[${server_name}] Create tail on ${rel_filepath} failed`);
      if (e.errno != -2) {
        winston.error(e);
        return; //exit execution to perhaps curb a runaway process
      }
      winston.info(`[${server_name}] Watching for file generation: ${rel_filepath}`);

      const default_skips = ['world', 'world_the_end', 'world_nether', 'dynmap', 'plugins', 'web', 'region', 'playerdata', 'stats', 'data'];
      const fw = fireworm(instance.env.cwd, {skipDirEntryPatterns: default_skips});

      fw.add(`**/${rel_filepath}`);
      fw.on('add', function (fp) {
        if (abs_filepath == fp) {
          fw.clear();
          winston.info(`[${server_name}] ${path.basename(fp)} created! Watchfile ${rel_filepath} closed`);
          async.nextTick(function () {
            make_tail(rel_filepath)
          });
        }
      })
    }
  }

  self.direct_dispatch = function (user, args) {
    let fn, required_args: any[];
    const arg_array: any[] = [];

    async.waterfall([
      async.apply(instance.property, 'owner'),
      function (ownership_data, cb) {
        auth.test_membership(user, ownership_data.groupname, function (is_valid) {
          cb(null, is_valid);
        });
      },
      function (is_valid, cb) {
        cb(!is_valid); //logical NOT'ted:  is_valid ? falsy error, !is_valid ? truthy error
      }
    ], function (err) {
      if (err) {
        winston.error(`User "${user}" does not have permissions on [${args.server_name}]:`, args);
      } else {
        try {
          fn = instance[args.command];
          required_args = introspect(fn);
          // receives an array of all expected arguments, using introspection.
          // they are in order as listed by the function definition, which makes iteration possible.
        } catch (e) {
          args.success = false;
          args.error = e;
          args.time_resolved = Date.now();
          nsp.emit('server_fin', args);
          winston.error('server_fin', args);

          return;
        }

        for (let i in required_args) {
          // all callbacks expected to follow the pattern (success, payload).
          if (required_args[i] == 'callback')
            arg_array.push(function (err, _) {
              args.success = !err;
              args.err = err;
              args.time_resolved = Date.now();
              nsp.emit('server_fin', args);
              if (err)
                winston.error(`[${server_name}] command "${args.command}" errored out:`, args);
              winston.log('server_fin', args)
            })
          else if (required_args[i] in args) {
            arg_array.push(args[required_args[i]])
          } else {
            args.success = false;
            winston.error('Provided values missing required argument', required_args[i]);
            args.error = `Provided values missing required argument: ${required_args[i]}`;
            nsp.emit('server_fin', args);
            return;
          }
        }

        if (args.command == 'delete')
          self.cleanup();

        winston.info(`[${server_name}] received request "${args.command}"`)
        fn.apply(instance, arg_array);
      }
    })
  }

  nsp.on('connection', function (socket) {
    const ip_address = socket.request.connection.remoteAddress;
    const username = socket.request.user?.username;
    const NOTICES_QUEUE_LENGTH = 10; // 0 < q <= 10

    function server_dispatcher(args) {
      let fn, required_args;
      const arg_array: any[] = [];

      try {
        fn = instance[args.command];
        required_args = introspect(fn);
        // receives an array of all expected arguments, using introspection.
        // they are in order as listed by the function definition, which makes iteration possible.
      } catch (e) {
        args.success = false;
        args.error = e;
        args.time_resolved = Date.now();
        nsp.emit('server_fin', args);
        winston.error('server_fin', args);

        while (notices.length > NOTICES_QUEUE_LENGTH)
          notices.shift();
        notices.push(args);
        return;
      }

      for (let i in required_args) {
        // all callbacks expected to follow the pattern (success, payload).
        if (required_args[i] == 'callback')
          arg_array.push((err, _) => {
            args.success = !err;
            args.err = err;
            args.time_resolved = Date.now();
            nsp.emit('server_fin', args);
            if (err)
              winston.error(`[${server_name}] command "${args.command}" errored out:`, args);
            winston.log('server_fin', args)

            while (notices.length > NOTICES_QUEUE_LENGTH)
              notices.shift();

            if (args.command != 'delete')
              notices.push(args);
          })
        else if (required_args[i] in args) {
          arg_array.push(args[required_args[i]])
        } else {
          args.success = false;
          winston.error('Provided values missing required argument', required_args[i]);
          args.error = `Provided values missing required argument: ${required_args[i]}`;
          nsp.emit('server_fin', args);
          return;
        }
      }

      if (args.command == 'delete')
        self.cleanup();

      winston.info(`[${server_name}] received request "${args.command}"`)
      fn.apply(instance, arg_array);
    }

    function produce_receipt(args) {
      winston.info(`[${server_name}] ${ip_address} issued command : "${args.command}"`)
      args.uuid = uuid.v1();
      args.time_initiated = Date.now();
      nsp.emit('server_ack', args);

      switch (args.command) {
        case 'chown':
          async.waterfall([
            async.apply(instance.property, 'owner'),
            function (owner_data, cb) {
              if (owner_data.username != username)
                cb('Only the current user owner may reassign server ownership.');
              else if (owner_data.uid != args.uid)
                cb('You may not change the user owner of the server.');
              else
                cb();
            }
          ], function (err) {
            if (err) {
              args.success = false;
              args.err = err;
              args.time_resolved = Date.now();
              winston.error(`[${server_name}] command "${args.command}" errored out:`, args);
              nsp.emit('server_fin', args);
            } else {
              server_dispatcher(args);
            }
          })
          break;
        default:
          server_dispatcher(args);
          break;
      }

    }

    function get_file_contents(rel_filepath) {
      if (rel_filepath in tails) { //this is the protection from malicious client
        // a tail would only exist for a file the server itself has opened
        const abs_filepath = path.join(instance.env['cwd'], rel_filepath);
        const FILESIZE_LIMIT_THRESHOLD = 256000;

        async.waterfall([
          async.apply(fs.stat, abs_filepath),
          function (stat_data, cb) {
            cb(stat_data.size > FILESIZE_LIMIT_THRESHOLD)
          },
          async.apply(fs.readFile, abs_filepath),
          function (data, cb) {
            winston.info(`[${server_name}] transmittting existing file contents: ${rel_filepath} (${data.length} bytes)`);
            nsp.emit('file head', {filename: rel_filepath, payload: data.toString()});
            cb();
          }
        ], function (err) {
          if (err) {
            const msg = `File is too large (> ${FILESIZE_LIMIT_THRESHOLD / 1000} KB).  Only newly added lines will appear here.`;
            nsp.emit('file head', {filename: rel_filepath, payload: msg});
          }
        })
      }
    }

    function get_available_tails() {
      for (const t in tails)
        get_file_contents(tails[t].filename.replace(instance.env.cwd + '/', ''));
    }

    function get_prop(requested) {
      winston.info(`[${server_name}] ${ip_address} requesting property: ${requested.property}`);
      instance.property(requested.property, function (err, retval) {
        winston.info(`[${server_name}] returned to ${ip_address}: ${retval}`);
        nsp.emit('server_fin', {'server_name': server_name, 'property': requested.property, 'payload': retval});
      })
    }

    function get_page_data(page) {
      switch (page) {
        case 'glance':
          winston.debug(`[${server_name}] ${username} requesting server at a glance info`);

          async.parallel({
            'increments': async.apply(instance.list_increments),
            'archives': async.apply(instance.list_archives),
            'du_awd': async.apply(instance.property, 'du_awd'),
            'du_bwd': async.apply(instance.property, 'du_bwd'),
            'du_cwd': async.apply(instance.property, 'du_cwd'),
            'owner': async.apply(instance.property, 'owner'),
            'server_files': async.apply(instance.property, 'server_files'),
            'ftb_installer': async.apply(instance.property, 'FTBInstall.sh'),
            'eula': async.apply(instance.property, 'eula'),
            'base_dir': function (cb) {
              cb(null, user_config.base_directory)
            }
          }, function (err, results) {
            winston.error(`[${server_name}] Error with get_page_data`, err, results);
            nsp.emit('page_data', {page: page, payload: results});
          })
          break;
        default:
          nsp.emit('page_data', {page: page});
          break;
      }
    }

    function manage_cron(opts) {
      function reload_cron(callback) {
        for (let c in cron) {
          try {
            cron[c].stop();
          } catch (e) {
          }
        }
        cron = {};

        instance.crons(function (err, cron_dict) {
          for (let cronhash in cron_dict) {
            if (cron_dict[cronhash].enabled) {
              try {
                cron[cronhash] = new CronJob({
                  cronTime: cron_dict[cronhash].source,
                  onTick: function () {
                    server_dispatcher(this);
                  },
                  start: true,
                  context: cron_dict[cronhash]
                });
              } catch (e) {
                //catches invalid cron pattern, disables cron
                winston.warn(`[${server_name}] ${ip_address} invalid cron expression submitted:`, cron_dict[cronhash].source);
                instance.set_cron(opts.hash, false, function () {
                });
              }
            }
          }
          callback();
        })
      }

      const operation = opts.operation;
      delete opts.operation;

      switch (operation) {
        case 'create':
          const cron_hash = hash(opts);
          winston.log(`[${server_name}] ${ip_address} requests cron creation:`, cron_hash, opts);

          opts['enabled'] = false;

          async.series([
            async.apply(instance.add_cron, cron_hash, opts),
            async.apply(reload_cron)
          ])
          break;
        case 'delete':
          winston.info(`[${server_name}] ${ip_address} requests cron deletion: ${opts.hash}`);

          try {
            cron[opts.hash].stop();
          } catch (e) {
          }

          try {
            delete cron[opts.hash];
          } catch (e) {
          }

          async.series([
            async.apply(instance.delete_cron, opts.hash),
            async.apply(reload_cron)
          ])
          break;
        case 'start':
          winston.info(`[${server_name}] ${ip_address} starting cron: ${opts.hash}`);

          async.series([
            async.apply(instance.set_cron, opts.hash, true),
            async.apply(reload_cron)
          ])
          break;
        case 'suspend':
          winston.info(`[${server_name}] ${ip_address} suspending cron: ${opts.hash}`);

          async.series([
            async.apply(instance.set_cron, opts.hash, false),
            async.apply(reload_cron)
          ])
          break;
        default:
          winston.warn(`[${server_name}] ${ip_address} requested unexpected cron operation: ${operation}`, opts);
      }
    }

    async.waterfall([
      async.apply(instance.property, 'owner'),
      function (ownership_data, cb) {
        auth.test_membership(username, ownership_data.groupname, function (is_valid) {
          cb(null, is_valid);
        });
      },
      function (is_valid, cb) {
        cb(!is_valid); //logical NOT'ted:  is_valid ? falsy error, !is_valid ? truthy error
      }
    ], function (err) {
      if (err)
        socket.disconnect();
      else {
        winston.info(`[${server_name}] ${username} (${ip_address}) joined server namespace`);

        socket.on('command', produce_receipt);
        socket.on('get_file_contents', get_file_contents);
        socket.on('get_available_tails', get_available_tails);
        socket.on('property', get_prop);
        socket.on('page_data', get_page_data);
        socket.on('cron', manage_cron);
        socket.on('server.properties', broadcast_sp);
        socket.on('server.config', broadcast_sc);
        socket.on('cron.config', broadcast_cc);
        socket.on('server-icon.png', broadcast_icon);
        socket.on('config.yml', broadcast_cy);
        socket.on('req_server_activity', broadcast_notices);
      }
    })

  }) //nsp on connect container ends
}