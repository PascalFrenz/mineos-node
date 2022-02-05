import { MINE_OS } from "./mineos";
import async from "async";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { constants } from "fs";
import procfs from "procfs-stats";
import which from "which";
import profiles_const from "../profiles.d/profiles"
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
import { ServerDiscovery } from "./server/ServerDiscovery";

winston.add(new winston.transports.File({
  filename: '/var/log/mineos.log',
  handleExceptions: true
}));

class Backend {
  constructor(
    private base_dir: string,
    private socket_emitter: Server,
    private user_config: Record<string, string> & { creators?: string}
  ) {
    process.umask(0o002);

    fs.ensureDirSync(base_dir);
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['servers']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['backup']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['archive']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['import']));
    fs.ensureDirSync(path.join(base_dir, MINE_OS.DIRS['profiles']));

    fs.chmod(path.join(base_dir, MINE_OS.DIRS['import']), 0o777);
  }
}


export const backend = function (this: any, base_dir: string, socket_emitter: Server, user_config: { creators?: string; }): void {
  const self = this;
  const serverWatcher = new ServerDiscovery(path.join(base_dir, MINE_OS.DIRS['servers']), socket_emitter, user_config);
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
  serverWatcher.startServerWatcher();
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

