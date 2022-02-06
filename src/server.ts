import { MINE_OS } from "./mineos";
import async from "async";
import path from "path";
import os from "os";
import fs from "fs-extra";
import procfs from "procfs-stats";
import which from "which";
import profiles_const from "../profiles.d/profiles"
import dgram from "dgram";
import fireworm from "fireworm";
import userid from "userid";
import request from "request";
import progress from "request-progress";
import unzip from "unzipper";
import admzip from "adm-zip";
import rsync from "rsync";
import child_process from "child_process";
import winston from "winston";

import passwd from "etc-passwd";
import { Server, Socket } from "socket.io";
import { ServerDiscovery } from "./server/ServerDiscovery";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

winston.add(new winston.transports.File({
  filename: '/var/log/mineos.log',
  handleExceptions: true
}));

export class Backend {

  private profiles: any[] = [];
  private serverWatcher: ServerDiscovery;

  constructor(
    private base_dir: string,
    private front_end: Server,
    private user_config: Record<string, string> & { creators?: string }
  ) {
    process.umask(0o002);

    fs.ensureDirSync(base_dir);
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['servers']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['backup']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['archive']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['import']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['profiles']));

    fs.chmod(path.join(base_dir, MINE_OS.DIRS['import']), 0o777);

    this.serverWatcher = new ServerDiscovery(path.join(base_dir, MINE_OS.DIRS['servers']), this.front_end, user_config);
    this.serverWatcher.startServerWatcher();
    this.initUdpBroadcaster();
    this.initHeartbeat();
    this.initFirewormWatcher();

    setTimeout(this.start_servers, 5000);
    this.front_end.on('connection', socket => this.init_connection(socket))
  }

  public get servers(): Record<string, any> {
    if (this.serverWatcher.servers) {
      return this.serverWatcher.servers;
    } else {
      return [];
    }
  }

  start_servers() {
    if (this.servers === undefined || this.servers === null) {
      console.log("servers was null or undefined");
      return;
    }
    console.log(this.servers)
    const MS_TO_PAUSE = 10000;
    async.eachLimit(
      Object.keys(this.servers),
      1,
      (server_name, callback) => {
        this.servers[server_name].onreboot_start(err => {
          if (err)
            winston.error(`[${server_name}] Aborted server startup; condition not met: `, err);
          else
            winston.info(`[${server_name}] Server started. Waiting ${MS_TO_PAUSE} ms...`);
          setTimeout(callback, (err ? 1 : MS_TO_PAUSE));
        });
      },
      (err) => {
        winston.error(`Error occurred while starting servers: ${err}`)
      }
    )
  }

  shutdown() {
    for (let server_name in this.servers) {
      this.servers[server_name].cleanup();
    }
    this.front_end.disconnectSockets(true);
  }

  send_profile_list(send_existing: boolean) {
    if (send_existing && this.profiles.length) //if requesting to just send what you already have AND they are already present
      this.front_end.emit('profile_list', this.profiles);
    else {
      const profile_dir = path.join(this.base_dir, MINE_OS.DIRS['profiles']);
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
        err => {
          console.error(err);
          this.profiles = profiles;
          this.front_end.emit('profile_list', this.profiles);
        }
      ) //end forEachOfLimit
    }
  }

  send_spigot_list() {
    const profiles_dir = path.join(this.base_dir, MINE_OS.DIRS['profiles']);
    const spigot_profiles = {};

    async.waterfall([
      async.apply(fs.readdir, profiles_dir),
      (listing, cb) => {
        for (let i in listing) {
          const match = listing[i].match(/(paper)?spigot_([\d.]+)/);
          if (match)
            spigot_profiles[match[0]] = {
              'directory': match[0],
              'jarfiles': fs.readdirSync(path.join(profiles_dir, match[0])).filter(a => a.match(/.+\.jar/i))
            }
        }
        cb();
      }
    ], () => {
      this.front_end.emit('spigot_list', spigot_profiles);
    })
  }

  send_locale_list() {
    async.waterfall([
      async.apply(fs.readdir, path.join(__dirname, 'html', 'locales')),
      (locale_paths: string[], cb) => {
        const locales = ["de", "en", "fr", "it", "ja", "no", "ru", "sv"];
        cb(null, locales);
      }
    ], (err, output) => {
      winston.info(output);
      if (!err)
        this.front_end.emit('locale_list', output);
      else
        this.front_end.emit('locale_list', ['en_US']);
    })
  }

  send_importable_list() {
    const importable_archives = path.join(this.base_dir, MINE_OS.DIRS['import']);
    const all_info: any[] = [];

    fs.readdir(importable_archives, (err, files) => {
      if (!err) {
        const fullpath = files.map((value, index) => path.join(importable_archives, value));

        const stat = fs.stat;
        async.map<any, any>(fullpath, stat, (inner_err, results) => {
          results?.forEach((value, index) => {
            all_info.push({
              time: value?.mtime,
              size: value?.size,
              filename: files[index]
            })
          })

          all_info.sort((a, b) => a.time.getTime() - b.time.getTime());

          this.front_end.emit('archive_list', all_info);
        });
      }
    })
  }

  private initUdpBroadcaster() {
    const udp_broadcaster = {};
    const UDP_DEST = '255.255.255.255';
    const UDP_PORT = 4445;
    const BROADCAST_DELAY_MS = 4000;

    async.forever(
      next => {
        for (let s in this.servers) {
          this.servers[s].broadcast_to_lan((msg, server_ip) => {
            if (msg) {
              if (udp_broadcaster[server_ip]) {
                udp_broadcaster[server_ip].send(msg, 0, msg.length, UDP_PORT, UDP_DEST);
              } else {
                udp_broadcaster[server_ip] = dgram.createSocket('udp4');
                udp_broadcaster[server_ip].bind(UDP_PORT, server_ip);
                udp_broadcaster[server_ip].on("listening", () => {
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

  private initHeartbeat() {
    const HOST_HEARTBEAT_DELAY_MS = 1000;

    function host_heartbeat(server_socket: Server) {
      // @ts-ignore types do not include procfs.meminfo call...
      procfs.meminfo((err, meminfo) => {
        server_socket.emit('host_heartbeat', {
          'uptime': os.uptime(),
          'freemem': ((meminfo && meminfo.MemAvailable) ? Number(meminfo.MemAvailable) * 1024 : os.freemem()),
          'loadavg': os.loadavg()
        })
      })
    }

    setInterval(host_heartbeat, HOST_HEARTBEAT_DELAY_MS, this.front_end);
  }

  private initFirewormWatcher() {
    const importable_archives = path.join(this.base_dir, MINE_OS.DIRS['import']);
    const fw = fireworm(importable_archives);
    fw.add('**/*.zip');
    fw.add('**/*.tar');
    fw.add('**/*.tgz');
    fw.add('**/*.tar.gz');

    fw
      .on('add', fp => {
        winston.info('[WEBUI] New file found in import directory', fp);
        this.send_importable_list();
      })
      .on('remove', fp => {
        winston.info('[WEBUI] File removed from import directory', fp);
        this.send_importable_list();
      })
  }

  private send_user_list(username, socket) {
    const users: any[] = [];
    const groups: any[] = [];

    passwd.getUsers()
      .on('user', user_data => {
        if (user_data.username == username)
          users.push({
            username: user_data.username,
            uid: user_data.uid,
            gid: user_data.gid,
            home: user_data.home
          })
      })
      .on('end', () => {
        socket.emit('user_list', users);
      });

    passwd.getGroups()
      .on('group', group_data => {
        if (group_data.users.indexOf(username) >= 0 || group_data.gid == userid.gids(username)[0]) {
          if (group_data.gid > 0) {
            groups.push({
              groupname: group_data.groupname,
              gid: group_data.gid
            })
          }
        }
      })
      .on('end', () => {
        socket.emit('group_list', groups);
      });
  }

  private webui_dispatcher(ip_address, username, args) {
    const OWNER_CREDS = {
      uid: userid.uid(username),
      gid: userid.gids(username)[0]
    };
    winston.info(`[WEBUI] Received emit command from ${ip_address}:${username}`, args);
    let instance;
    let spigot_path;
    let dest_path;
    switch (args.command) {
      case 'create':
        instance = new MINE_OS.mc(args.server_name, this.base_dir);

        async.series([
          async.apply(instance.verify, '!exists'),
          cb => {
            let whitelisted_creators = [username]; //by default, accept create attempt by current user
            if ((this.user_config || {}).creators) {  //if creators key:value pair exists, use it
              whitelisted_creators = this.user_config['creators']?.split(',') ?? [];
              whitelisted_creators = whitelisted_creators.filter(e => e); //remove non-truthy entries like ''
              whitelisted_creators = whitelisted_creators.map(e => e.trim()); //remove trailing and tailing whitespace

              winston.info('Explicitly authorized server creators are:', whitelisted_creators);
            }
            cb(null, !(whitelisted_creators.indexOf(username) >= 0))
          },
          async.apply(instance.create, OWNER_CREDS),
          async.apply(instance.overlay_sp, args.properties),
        ], (err, _) => {
          if (!err)
            winston.info(`[${args.server_name}] Server created in filesystem.`);
          else {
            winston.info(`[${args.server_name}] Failed to create server in filesystem as user ${username}.`);
            winston.error(err);
          }
        })
        break;
      case 'create_unconventional_server':
        instance = new MINE_OS.mc(args.server_name, this.base_dir);

        async.series([
          async.apply(instance.verify, '!exists'),
          async.apply(instance.create_unconventional_server, OWNER_CREDS),
        ], (err, _) => {
          if (!err)
            winston.info(`[${args.server_name}] Server (unconventional) created in filesystem.`);
          else
            winston.error(err);
        })
        break;
      case 'download':
        for (let idx in this.profiles) {
          if (this.profiles[idx].id == args.profile.id) {
            const SOURCES = profiles_const.profile_manifests;
            const profile_dir = path.join(this.base_dir, 'profiles', args.profile.id);
            const dest_filepath = path.join(profile_dir, args.profile.filename);

            async.series([
              async.apply(fs.ensureDir, profile_dir),
              cb => {
                progress(request({url: args.profile.url, headers: {'User-Agent': 'MineOS-node'}}), {
                  throttle: 250,
                  delay: 100
                })
                  .on('error', err => {
                    winston.error(err);
                  })
                  .on('progress', state => {
                    args.profile.progress = state;
                    this.front_end.emit('file_progress', args.profile);
                  })
                  .on('complete', response => {
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
              cb => {
                switch (path.extname(args.profile.filename).toLowerCase()) {
                  case '.jar':
                    cb();
                    break;
                  case '.zip':
                    fs.createReadStream(dest_filepath)
                      .pipe(unzip.Extract({path: profile_dir})
                        .on('close', () => {
                          cb()
                        })
                        .on('error', () => {
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
              cb => {
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
            ], () => this.send_profile_list(false))
            break;
          }
        }
        break;
      case 'build_jar':
        let working_dir, bt_path, params;
        try {
          const profile_path = path.join(this.base_dir, MINE_OS.DIRS['profiles']);
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
          cb => {
            const binary = which.sync('java');
            const proc = child_process.spawn(binary, ['-Xms512M', '-jar', dest_path, '--rev', args.version], params);

            proc.stdout.on('data', data => {
              this.front_end.emit('build_jar_output', data.toString());
              //logging.log('stdout: ' + data);
            });

            winston.info('[WEBUI] BuildTools starting with arguments:', args)

            proc.stderr.on('data', data => {
              this.front_end.emit('build_jar_output', data.toString());
              winston.error('stderr: ' + data);
            });

            proc.on('close', code => {
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

          this.front_end.emit('host_notice', retval);
          this.send_spigot_list();
        })
        break;
      case 'delete_build':
        if (args.type == 'spigot')
          spigot_path = path.join(this.base_dir, MINE_OS.DIRS['profiles'], 'spigot_' + args.version);
        else {
          winston.error('[WEBUI] Unknown type of craftbukkit server -- potential modified webui request?');
          return;
        }

        fs.remove(spigot_path, err => {
          const retval = {
            'command': 'Delete BuildTools jar',
            'success': true,
            'help_text': ''
          };

          if (err) {
            retval['success'] = false;
            retval['help_text'] = `Error ${err}`;
          }

          this.front_end.emit('host_notice', retval);
          this.send_spigot_list();
        })
        break;
      case 'copy_to_server':
        if (args.type == 'spigot')
          spigot_path = path.join(this.base_dir, MINE_OS.DIRS['profiles'], 'spigot_' + args.version) + '/';
        else {
          winston.error('[WEBUI] Unknown type of craftbukkit server -- potential modified webui request?');
          return;
        }
        dest_path = path.join(this.base_dir, MINE_OS.DIRS['servers'], args.server_name) + '/';

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

          this.front_end.emit('host_notice', retval);
          for (let s in this.servers)
            this.front_end.emit('track_server', s);
        });

        break;
      case 'refresh_server_list':
        for (let s in this.servers)
          this.front_end.emit('track_server', s);
        break;
      case 'refresh_profile_list':
        this.send_profile_list(false);
        this.send_spigot_list();
        break;
      case 'create_from_archive':
        instance = new MINE_OS.mc(args.new_server_name, this.base_dir);

        let filepath;
        if (args.awd_dir)
          filepath = path.join(instance.env.base_dir, MINE_OS.DIRS['archive'], args.awd_dir, args.filename);
        else
          filepath = path.join(instance.env.base_dir, MINE_OS.DIRS['import'], args.filename);

        async.series([
          async.apply(instance.verify, '!exists'),
          async.apply(instance.create_from_archive, OWNER_CREDS, filepath)
        ], (err, _) => {
          if (!err) {
            winston.info(`[${args.new_server_name}] Server created in filesystem.`);
            setTimeout(() => {
              this.front_end.emit('track_server', args.new_server_name)
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

  private init_connection(socket: Socket<DefaultEventsMap, DefaultEventsMap>) {
    const ip_address = socket.request.socket.remoteAddress;
    // @ts-ignore
    const username = socket.request.user.username;

    winston.info(`[WEBUI] ${username} connected from ${ip_address}`);
    socket.emit('whoami', username);
    socket.emit('commit_msg', "");
    socket.emit('change_locale', (this.user_config || {})['webui_locale']);
    socket.emit('optional_columns', (this.user_config || {})['optional_columns']);

    for (let server_name in this.servers)
      socket.emit('track_server', server_name);

    socket.on('command', (args) => this.webui_dispatcher(ip_address, username, args));
    this.send_user_list(username, socket);
    this.send_profile_list(true);
    this.send_spigot_list();
    this.send_importable_list();
    this.send_locale_list();

  }
}

