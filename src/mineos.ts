import fs from "fs-extra";
import path from "path";
import async, { Dictionary } from "async";
import child_process from "child_process";
import which from "which";
import du from "du";
import { constants, Stats } from "fs";

import net from "net";

interface MineOS {
  mc: (server_name, base_dir) => void;
  dependencies: (callback) => void;
  extract_server_name: (base_dir: string, server_path: string) => string | undefined;
  valid_server_name: (server_name) => boolean;
  server_pids_up: () => {};
  DIRS: Record<string, string>;
  SP_DEFAULTS: Record<string, string | number>;
  server_list: (base_dir: any) => string[];
  server_list_up: () => string[];
}

const proc_paths = [
  '/usr/compat/linux/proc',
  '/system/lxproc',
  '/proc',
  '/compat/linux/proc'
];

let PROC_PATH = '';

for (let proc in proc_paths) {
  try {
    fs.statSync(path.join(proc_paths[proc], 'uptime'));
    PROC_PATH = proc_paths[proc];
    break;
  } catch (e) {
    console.log("Did not find process at " + proc_paths[proc] + ", trying more..");
  }
}

export const MINE_OS: MineOS = {
  DIRS: {
    'servers': 'servers',
    'backup': 'backup',
    'archive': 'archive',
    'profiles': 'profiles',
    'import': 'import'
  },
  SP_DEFAULTS: {
    'server-port': 25565,
    'max-players': 20,
    'level-seed': '',
    'gamemode': 0,
    'difficulty': 1,
    'level-type': 'DEFAULT',
    'level-name': 'world',
    'max-build-height': 256,
    'generate-structures': 'true',
    'generator-settings': '',
    'server-ip': '0.0.0.0',
    'enable-query': 'false'
  },
  server_list: base_dir => fs.readdirSync(path.join(base_dir, MINE_OS.DIRS['servers'])),
  server_list_up: () => Object.keys(MINE_OS.server_pids_up()),
  server_pids_up: server_pids_up,
  valid_server_name: server_name => /^(?!\.)[a-zA-Z0-9_.]+$/.test(server_name),
  extract_server_name: (base_dir, server_path) => {
    const re = new RegExp(`${path.join(base_dir, MINE_OS.DIRS['servers'])}/([a-zA-Z0-9_.]+)`);
    try {
      return re.exec(server_path)?.[1];
    } catch(e) {
      throw new Error('no server name in path');
    }
  },
  dependencies: callback => {
    async.parallel({
      'screen': async.apply(which, 'screen'),
      'tar': async.apply(which, 'tar'),
      'rsync': async.apply(which, 'rsync'),
      'java': async.apply(which, 'java'),
      'rdiff-backup': async.apply(which, 'rdiff-backup')
    }, callback);
  },
  mc: (server_name, base_dir) => mc(server_name, base_dir)
};

function server_pids_up() {
  let cmdline, environ, match;
  const pids = fs.readdirSync(PROC_PATH).filter(function (e) {
    if (/^([0-9]+)$/.test(e)) {
      return e
    }
  });
  const SCREEN_REGEX = /screen[^S]+S mc-([^\s]+)/i;
  const JAVA_REGEX = /\.mc-([^\s]+)/i;
  const servers_found = {};
  let screen_match;
  let java_match;

  for (let i=0; i < pids.length; i++) {
    try {
      cmdline = fs.readFileSync(path.join(PROC_PATH, pids[i].toString(), 'cmdline'))
        .toString('ascii')
        .replace(/\u0000/g, ' ');
    } catch (e) {
      continue;
    }

    screen_match = SCREEN_REGEX.exec(cmdline);

    if (screen_match) {
      if (screen_match[1] in servers_found)
        servers_found[screen_match[1]]['screen'] = parseInt(pids[i]);
      else
        servers_found[screen_match[1]] = {'screen': parseInt(pids[i])}
    } else {
      try {
        environ = fs.readFileSync(path.join(PROC_PATH, pids[i].toString(), 'environ'))
          .toString('ascii')
          .replace(/\u0000/g, ' ');
      } catch (e) {
        continue;
      }

      java_match = JAVA_REGEX.exec(environ);

      if (java_match) {
        if (java_match[1] in servers_found)
          servers_found[java_match[1]]['java'] = parseInt(pids[i]);
        else
          servers_found[java_match[1]] = {'java': parseInt(pids[i])}
      }
    }
  }
  return servers_found;
}

function mc(this: any, server_name, base_dir) {
  const self: any = this;
  self.server_name = server_name;

  process.umask(0o002);

  self.env = {
    base_dir: base_dir,
    cwd: path.join(base_dir, MINE_OS.DIRS['servers'], server_name),
    bwd: path.join(base_dir, MINE_OS.DIRS['backup'], server_name),
    awd: path.join(base_dir, MINE_OS.DIRS['archive'], server_name),
    pwd: path.join(base_dir, MINE_OS.DIRS['profiles']),
    sp: path.join(base_dir, MINE_OS.DIRS['servers'], server_name, 'server.properties'),
    sc: path.join(base_dir, MINE_OS.DIRS['servers'], server_name, 'server.config'),
    cc: path.join(base_dir, MINE_OS.DIRS['servers'], server_name, 'cron.config')
  }

  // ini related functions and vars

  const memoized_files = {};
  let memoize_timestamps = {};

  function read_ini(filepath, callback) {
    const ini = require('ini');

    fs.readFile(filepath, function(err, data) {
      if (err) {
        fs.writeFile(filepath, '', function(inner_err) {
          callback(inner_err, {});
        });
      } else {
        callback(err, ini.parse(data.toString()));
      }
    })
  }

  // server properties functions

  self.sp = function(callback) {
    const fn = 'server.properties';
    async.waterfall([
      async.apply(fs.stat, self.env.sp),
      function(stat_data, cb) {
        if ( (fn in memoize_timestamps) &&
             (memoize_timestamps[fn] - stat_data.mtime == 0) ) {
          memoized_files[fn](self.env.sp, cb);
        } else {
          memoize_timestamps[fn] = stat_data.mtime;
          memoized_files[fn] = async.memoize(read_ini);
          memoized_files[fn](self.env.sp, cb);
        }
      }
    ], callback);
  }

  self.modify_sp = function(property, new_value, callback) {
    const ini = require('ini');

    async.waterfall([
      async.apply(self.sp),
      function(sp_data, cb) {
        sp_data[property] = new_value;
        cb(null, sp_data);
      },
      function(sp_data, cb) {
        memoize_timestamps['server.properties'] = 0;
        fs.writeFile(self.env.sp, ini.stringify(sp_data), cb);
      }
    ], callback)
  }

  self.overlay_sp = function(dict, callback) {
    const ini = require('ini');

    self.sp(function(err, props) {
      for (let key in dict)
        props[key] = dict[key];

      self._sp = props;
      memoize_timestamps['server.properties'] = 0;
      fs.writeFile(self.env.sp, ini.stringify(self._sp), callback);
    })
  }

  // server config functions
  self.sc = function(callback) {
    const fn = 'server.config';
    async.waterfall([
      async.apply(fs.stat, self.env.sc),
      function(stat_data, cb) {
        if ( (fn in memoize_timestamps) &&
             (memoize_timestamps[fn] - stat_data.mtime == 0) ) {
          memoized_files[fn](self.env.sc, cb);
        } else {
          memoize_timestamps[fn] = stat_data.mtime;
          memoized_files[fn] = async.memoize(read_ini);
          memoized_files[fn](self.env.sc, cb);
        }
      }
    ], function(err, retval) {
      if (err) {
        delete memoize_timestamps[fn];
        delete memoized_files[fn];
        callback(null, {});
      } else {
        callback(err, retval);
      }
    });
  }

  self.modify_sc = function(section, property, new_value, callback) {
    const ini = require('ini');

    async.waterfall([
      async.apply(self.sc),
      function(sc_data, cb) {
        try {
          sc_data[section][property] = new_value;
        } catch (e) {
          sc_data[section] = {};
          sc_data[section][property] = new_value;
        }
        cb(null, sc_data);
      },
      function(sc_data, cb) {
        memoize_timestamps['server.config'] = 0;
        fs.writeFile(self.env.sc, ini.stringify(sc_data), cb);
      }
    ], callback)
  }

  // cron config functions
  self.crons = function(callback) {
    read_ini(self.env.cc, callback);
  }

  self.add_cron = function(identifier, definition, callback) {
    const ini = require('ini');

    async.waterfall([
      async.apply(self.crons),
      function(cron_data, cb) {
        cron_data[identifier] = definition;
        cron_data[identifier]['enabled'] = false;
        cb(null, cron_data);
      },
      function(cron_data, cb) {
        fs.writeFile(self.env.cc, ini.stringify(cron_data), cb);
      }
    ], callback)
  }

  self.delete_cron = function(identifier, callback) {
    const ini = require('ini');

    async.waterfall([
      async.apply(self.crons),
      function(cron_data, cb) {
        delete cron_data[identifier];
        cb(null, cron_data);
      },
      function(cron_data, cb) {
        fs.writeFile(self.env.cc, ini.stringify(cron_data), cb);
      }
    ], callback)
  }

  self.set_cron = function(identifier, enabled, callback) {
    const ini = require('ini');

    async.waterfall([
      async.apply(self.crons),
      function(cron_data, cb) {
        cron_data[identifier]['enabled'] = enabled;
        cb(null, cron_data);
      },
      function(cron_data, cb) {
        fs.writeFile(self.env.cc, ini.stringify(cron_data), cb);
      }
    ], callback)
  }

  self.create = function(owner: {uid: string, gid: string}, callback) {
    async.series([
      async.apply(self.verify, '!exists'),
      async.apply(self.verify, '!up'),
      async.apply(fs.ensureDir, self.env.cwd),
      async.apply(fs.chown, self.env.cwd, owner.uid, owner.gid),
      async.apply(fs.ensureDir, self.env.bwd),
      async.apply(fs.chown, self.env.bwd, owner.uid, owner.gid),
      async.apply(fs.ensureDir, self.env.awd),
      async.apply(fs.chown, self.env.awd, owner.uid, owner.gid),
      async.apply(fs.ensureFile, self.env.sp),
      async.apply(fs.chown, self.env.sp, owner.uid, owner.gid),
      async.apply(fs.ensureFile, self.env.sc),
      async.apply(fs.chown, self.env.sc, owner.uid, owner.gid),
      async.apply(fs.ensureFile, self.env.cc),
      async.apply(fs.chown, self.env.cc, owner.uid, owner.gid),
      async.apply(self.overlay_sp, MINE_OS.SP_DEFAULTS),
      async.apply(self.modify_sc, 'java', 'java_binary', ''),
      async.apply(self.modify_sc, 'java', 'java_xmx', '256'),
      async.apply(self.modify_sc, 'onreboot', 'start', false),
    ], callback)
  }

  self.create_unconventional_server = function(owner, callback) {
    async.series([
      async.apply(self.verify, '!exists'),
      async.apply(self.verify, '!up'),
      async.apply(fs.ensureDir, self.env.cwd),
      async.apply(fs.chown, self.env.cwd, owner['uid'], owner['gid']),
      async.apply(fs.ensureDir, self.env.bwd),
      async.apply(fs.chown, self.env.bwd, owner['uid'], owner['gid']),
      async.apply(fs.ensureDir, self.env.awd),
      async.apply(fs.chown, self.env.awd, owner['uid'], owner['gid']),
      async.apply(fs.ensureFile, self.env.sp),
      async.apply(fs.chown, self.env.sp, owner['uid'], owner['gid']),
      async.apply(fs.ensureFile, self.env.sc),
      async.apply(fs.chown, self.env.sc, owner['uid'], owner['gid']),
      async.apply(fs.ensureFile, self.env.cc),
      async.apply(fs.chown, self.env.cc, owner['uid'], owner['gid']),
      async.apply(self.modify_sc, 'minecraft', 'unconventional', true),
    ], callback)
  }

  self.create_from_archive = function(owner, filepath, callback) {

    function move_to_parent_dir(source_dir, inner_callback) {
      let remainder = '';
      const attempted_move = false;

      async.waterfall([
        async.apply(fs.readdir, source_dir),
        function(files, cb) {
          if (files.length == 1) {
            remainder = files[0];
            cb(null);
          } else if (files.length == 4) {
            const sp_idx = files.indexOf('server.properties');
            const sc_idx = files.indexOf('server.config');
            const cc_idx = files.indexOf('cron.config');
            if (sp_idx >= 0) { files.splice(sp_idx, 1) }
            if (sc_idx >= 0) { files.splice(sc_idx, 1) }
            if (cc_idx >= 0) { files.splice(cc_idx, 1) }
            remainder = files[0]
            cb(!(files.length == 1)) // logically NOT-ing so len==1 continues
          } else
            cb(true);
        },
        function(cb) {
          const attempted_move = true;
          const inside_dir = path.join(source_dir, remainder);
          fs.lstat(inside_dir, function(err, stat) {
            if (stat.isDirectory())
              cb(null);
            else
              cb(true);
          })
        },
        function(cb) {
          const old_dir = path.join(source_dir, remainder);

          fs.readdir(old_dir, function(err, files) {
            if (!err)
              async.each(files, function(file, inner_cb) {
                const old_filepath = path.join(old_dir, file);
                const new_filepath = path.join(source_dir, file);

                fs.move(old_filepath, new_filepath, inner_cb)
              }, cb);
            else
              cb(err);
          })
        }
      ], function(err) {
        if (attempted_move)
          inner_callback(err);
        else
          inner_callback(null); //not really an error if it cancelled because no parent dir
      });
    }

    let dest_filepath;
    if (filepath.match(/\//))  //if it has a '/', its hopefully an absolute path
      dest_filepath = filepath;
    else // if it doesn't treat it as being from /import/
      dest_filepath = path.join(self.env.base_dir, MINE_OS.DIRS['import'], filepath);

    const split = dest_filepath.split('.');
    let extension = split.pop();

    if (extension == 'gz')
      if (split.pop() == 'tar')
        extension = 'tar.gz';

    switch (extension) {
      case 'zip':
        const DecompressZip = require('decompress-zip');

      function unzipper_it(cb) {
          const unzipper = new DecompressZip(dest_filepath);

          unzipper.on('error', function (err) {
            cb(err);
          });

          unzipper.on('extract', function (log) {
            move_to_parent_dir(self.env.cwd, cb);
          });

          unzipper.extract({
            path: self.env.cwd
          });
        }

        async.series([
          async.apply(self.create, owner),
          async.apply(unzipper_it),
          async.apply(self.chown, owner['uid'], owner['gid'])
        ], callback)

        break;
      case 'tar.gz':
      case 'tgz':
      case 'tar':
        const binary = which.sync('tar');
        const args = ['-xf', dest_filepath];
        const params = {
          cwd: self.env.cwd,
          uid: owner.uid,
          gid: owner.gid
        };

        async.series([
          async.apply(self.create, owner),
          cb => {
            memoize_timestamps = {};
            const proc = child_process.spawn(binary, args, params);
            proc.once('exit', code => cb(null, code))
          }
        ], callback)
        break;
    }
  }

  self.accept_eula = function(callback) {
    const EULA_PATH = path.join(self.env.cwd, 'eula.txt');

    async.waterfall([
      async.apply(fs.outputFile, EULA_PATH, 'eula=true'),
      async.apply(fs.stat, self.env.cwd),
      function(stat, cb) {
        fs.chown(EULA_PATH, stat.uid, stat.gid, cb);
      }
    ], callback)
  }

  self.delete = function(callback) {
    async.series([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, '!up'),
      async.apply(fs.remove, self.env.cwd),
      async.apply(fs.remove, self.env.bwd),
      async.apply(fs.remove, self.env.awd)
    ], callback)
  }

  self.get_start_args = function(callback) {

    function type_jar_unconventional (inner_callback) {
      const java_binary = which.sync('java');

      async.series({
        'binary': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).java_binary || java_binary;
            cb((value.length ? null : new Error('No java binary assigned for server.')), value);
          });
        },
        'xmx': function (cb) {
          self.sc(function (err, dict) {
            const value = parseInt((dict.java || {}).java_xmx) || 0;

            cb((value >= 0 ? null : new Error('XMX heapsize must be positive integer >= 0')), value);
          });
        },
        'xms': function (cb) {
          self.sc(function (err, dict) {
            const xmx = parseInt((dict.java || {}).java_xmx) || 0;
            const xms = parseInt((dict.java || {}).java_xms) || 0;

            cb((xmx >= xms && xms >= 0 ? null : new Error('XMS heapsize must be positive integer where XMX >= XMS >= 0')), xms);
          });
        },
        'jarfile': function (cb) {
          self.sc(function (err, dict) {
            const jarfile = (dict.java || {}).jarfile;
            if (!jarfile)
              cb(new Error('Server not assigned a runnable jar'));
            else
              cb(null, jarfile);
          });
        },
        'jar_args': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).jar_args || '';
            cb(null, value);
          });
        },
        'java_tweaks': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).java_tweaks || null;
            cb(null, value);
          });
        }
      }, function(err, results: Dictionary<any>) {

        if (err) {
          inner_callback(err, {});
        } else {
          const args = ['-dmS', `mc-${self.server_name}`];
          args.push.apply(args, [results.binary, '-server']);

          if (results.xmx > 0)
            args.push(`-Xmx${results.xmx}M`);
          if (results.xms > 0)
            args.push(`-Xms${results.xms}M`);

          let splits;
          if (results.java_tweaks) {
            splits = results.java_tweaks.split(/ /);
            for (let i in splits)
              args.push(splits[i]);
          }

          args.push.apply(args, ['-jar', results.jarfile]);

          if (results.jar_args) {
            splits = results.jar_args.split(/ /);
            for (let i in splits)
              args.push(splits[i]);
          }

          inner_callback(null, args);
        }
      })
    }

    function type_jar(inner_callback) {
      const java_binary = which.sync('java');

      async.series({
        'binary': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).java_binary || java_binary;
            cb((value.length ? null : new Error('No java binary assigned for server.')), value);
          });
        },
        'xmx': function (cb) {
          self.sc(function (err, dict) {
            const value = parseInt((dict.java || {}).java_xmx) || 0;

            cb((value > 0 ? null : new Error('XMX heapsize must be positive integer > 0')), value);
          });
        },
        'xms': function (cb) {
          self.sc(function (err, dict) {
            const xmx = parseInt((dict.java || {}).java_xmx) || 0;
            const xms = parseInt((dict.java || {}).java_xms) || xmx;
            cb((xmx >= xms && xms > 0 ? null : new Error('XMS heapsize must be positive integer where XMX >= XMS > 0')), xms);
          });
        },
        'jarfile': function (cb) {
          self.sc(function (err, dict) {
            const jarfile = (dict.java || {}).jarfile;
            if (!jarfile)
              cb(new Error('Server not assigned a runnable jar'));
            else
              cb(null, jarfile);
          });
        },
        'jar_args': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).jar_args || 'nogui';
            cb(null, value);
          });
        },
        'java_tweaks': function (cb) {
          self.sc(function (err, dict) {
            const value = (dict.java || {}).java_tweaks || null;
            cb(null, value);
          });
        }
      }, function(err, results: Dictionary<any>) {
        if (err) {
          inner_callback(err, {});
        } else {
          const args = ['-dmS', `mc-${self.server_name}`];
          args.push.apply(args, [results.binary, '-server', `-Xmx${results.xmx}M`, `-Xms${results.xms}M`]);

          let splits;
          if (results.java_tweaks) {
            splits = results.java_tweaks.split(/ /);
            for (let i in splits)
              args.push(splits[i]);
          }

          args.push.apply(args, ['-jar', results.jarfile]);

          if (results.jar_args) {
            splits = results.jar_args.split(/ /);
            for (let i in splits)
              args.push(splits[i]);
          }

          if (results.jarfile.toLowerCase().indexOf('forge') == 0)
            if (results.jarfile.slice(-13).toLowerCase() == 'installer.jar')
              args.push('--installServer');

          inner_callback(null, args);
        }
      })
    }

    function type_phar(inner_callback) {
      async.series({
        'binary': function (cb) {
          const php7 = path.join(self.env.cwd, '/bin/php7/bin/php');
          try {
            fs.accessSync(php7, constants.F_OK)
            cb(null, './bin/php7/bin/php');
          } catch (e) {
            cb(null, './bin/php5/bin/php');
          }
        },
        'pharfile': function (cb) {
          self.sc(function (err, dict) {
            const pharfile = (dict.java || {}).jarfile;
            if (!pharfile)
              cb(new Error('Server not assigned a runnable phar'));
            else
              cb(null, pharfile);
          });
        }
      }, function(err, results) {
        if (err) {
          inner_callback(err, {});
        } else {
          const args = ['-dmS', `mc-${self.server_name}`, results.binary, results.pharfile];
          inner_callback(null, args);
        }
      })
    }

    function type_cuberite(inner_callback) {
      const args = ['-dmS', `mc-${self.server_name}`, './Cuberite'];
      inner_callback(null, args);
    }

    async.waterfall([
      async.apply(self.sc),
      function(sc_data, cb) {
        const jarfile = (sc_data.java || {}).jarfile;
        const unconventional = (sc_data.minecraft || {}).unconventional;

        if (!jarfile)
          cb('Cannot start server without a designated jar/phar.', null);
        else if (jarfile.slice(-4).toLowerCase() == '.jar') {
          if (unconventional)
            type_jar_unconventional(cb);
          else
            type_jar(cb);
        } else if (jarfile.slice(-5).toLowerCase() == '.phar')
          type_phar(cb);
        else if (jarfile == 'Cuberite')
          type_cuberite(cb);
      }
    ], callback)
  }

  self.copy_profile = function(callback) {
    function rsync_profile(source, dest, username, groupname, callback_er) {
      const rsync = require('rsync');

      const obj = rsync.build({
        source: source,
        destination: dest,
        flags: 'au',
        shell: 'ssh'
      });

      obj.set('--chown', `${username}:${groupname}`);
      obj.set('--chmod' ,'ug=rwX');

      obj.execute(function(error, code, cmd) {
        callback_er(code);
      });
    }

    let owner_info = null;

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, '!up'),
      async.apply(self.property, 'owner'),
      function(owner, cb) {
        owner_info = owner;
        cb();
      },
      async.apply(self.sc),
      function(sc, cb) {
        if ((sc.minecraft || {}).profile) {
          const source = path.join(self.env.pwd, sc.minecraft.profile) + '/';
          const dest = self.env.cwd + '/';
          rsync_profile(source, dest, owner_info?.['username'], owner_info?.['groupname'], cb);
        } else {
          cb(null);
        }
      }
    ], callback);
  }

  self.profile_delta = function(profile, callback) {
    const rsync = require('rsync');
    const stdout: any[] = [];
    const stderr: any[] = [];

    async.waterfall([
      function(cb) {
        const obj = rsync.build({
          source: path.join(self.env.pwd, profile) + '/',
          destination: self.env.cwd + '/',
          flags: 'vrun',
          shell: 'ssh',
          output: [function (output) {
            stdout.push(output);
          },
            function (output) {
              stderr.push(output);
            }]
        });

        obj.execute(function(error, code, cmd) {
          if (error)
            cb(code, stderr)
          else
            cb(code, stdout);
        });
      },
      function(incr_file_list, cb) {
        incr_file_list.shift();
        incr_file_list.pop();

        let all_files: any[] = [];

        for (let i in incr_file_list) {
          if (incr_file_list[i].toString().match(/sent \d+ bytes/))
            continue; //known pattern on freebsd: 'sent 79 bytes  received 19 bytes  196.00 bytes/sec'
          all_files = all_files.concat(incr_file_list[i].toString().split('\n'))
        }

        cb(null, all_files.filter(n => n.length));
      }
    ], callback)
  }

  self.start = function(callback) {
    let args = null;
    const params = {cwd: self.env.cwd};

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, '!up'),
      async.apply(self.property, 'owner'),
      function(owner, cb) {
        params['uid'] = owner['uid'];
        params['gid'] = owner['gid'];
        cb();
      },
      async.apply(self.get_start_args),
      function(start_args, cb) {
        args = start_args;
        cb();
      },
      async.apply(self.sc),
      function(sc_data, cb) {
        if ((sc_data.minecraft || {}).profile) {
          self.profile_delta(sc_data.minecraft.profile, function(err, changed_files) {
            if (err) {
              if (err == 23) //source dir of profile non-existent
                cb(); //ignore issue; profile non-essential to start (server_jar is req'd only)
              else
                cb(err);
            } else if (changed_files)
              self.copy_profile(cb);
            else
              cb();
          })
        } else {
          cb();
        }
      },
      async.apply(which, 'screen'),
      function(binary, cb) {
        const proc = child_process.spawn(binary, args!, params);
        proc.once('close', cb);
      }
    ], function(err, result) {
      setTimeout(function() {
        callback(err, result);
      }, 100)
    });
  }

  self.stop = function(callback) {
    const test_interval_ms = 200;
    let iterations = 0;
    const MAX_ITERATIONS_TO_QUIT = 150;

    async.series([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, 'up'),
      async.apply(self.stuff, 'stop'),
      function(cb) {
        async.whilst(
          function() {
            if (iterations > MAX_ITERATIONS_TO_QUIT)
              return false;
            else
              return (self.server_name in MINE_OS.server_pids_up())
          },
          function(cc) {
            iterations += 1;
            setTimeout(cc, test_interval_ms)
          },
          function(ignored_err) {
            if (self.server_name in MINE_OS.server_pids_up())
              cb(new Error("stop did not succeed")); //error, stop did not succeed
            else
              cb(null); //no error, stop succeeded as expected
          }
        );
      }
    ], callback);
  }

  self.restart = function(callback) {
    async.series([
      async.apply(self.stop),
      async.apply(self.start)
    ], callback)
  }

  self.stop_and_backup = function(callback) {
    async.series([
      async.apply(self.stop),
      async.apply(self.backup)
    ], callback)
  }

  self.kill = function(callback) {
    const pids = MINE_OS.server_pids_up();
    const test_interval_ms = 200;
    const MAX_ITERATIONS_TO_QUIT = 150;

    if (!(self.server_name in pids)) {
      callback(true);
    } else {
      process.kill(pids[self.server_name].java, 'SIGKILL');
      let iterations = 0;

      async.doWhilst(
        function(cb) {
          iterations += 1;
          setTimeout(cb, test_interval_ms);
        },
        function() {
          if (iterations > MAX_ITERATIONS_TO_QUIT)
            return false;
          else
            return (self.server_name in MINE_OS.server_pids_up());
        },
        function(ignored_err) {
          if (self.server_name in MINE_OS.server_pids_up())
            callback(true); //error, stop succeeded: false
          else
            callback(null); //no error, stop succeeded: true
        }
      )
    }
  }

  self.stuff = function(msg, callback) {
    const params = {cwd: self.env.cwd};
    const binary = which.sync('screen');

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, 'up'),
      function(cb) {
        self.property('owner', function(err, result) {
          params['uid'] = result['uid'];
          params['gid'] = result['gid'];
          cb(err);
        })
      },
      function(cb) {
        cb(null, child_process.spawn(binary,
                                     ['-S', `mc-${self.server_name}`,
                                      '-p', '0', '-X', 'eval', `stuff "${msg}"`],
                                     params));
      }
    ], callback);
  }

  self.saveall = function(seconds_delay, callback) {
    const params = {cwd: self.env.cwd};
    const binary = which.sync('screen');
    const FALLBACK_DELAY_SECONDS = 5;

    async.series([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, 'up'),
      function(cb) {
        self.property('owner', function(err, result) {
          params['uid'] = result['uid'];
          params['gid'] = result['gid'];
          cb(err);
        })
      },
      function(cb) {
        cb(null, child_process.spawn(binary,
                                     ['-S', `mc-${self.server_name}`,
                                      '-p', '0', '-X', 'eval', 'stuff "save-all"'],
                                     params));
      },
      function(cb) {
        const actual_delay = (parseInt(seconds_delay) || FALLBACK_DELAY_SECONDS) * 1000;
        setTimeout(cb, actual_delay);
      }
    ], callback);
  }

  self.saveall_latest_log = function(callback) {
    const TIMEOUT_LENGTH = 10000;
    const tail = require('tail').Tail;

    try {
      var new_tail = new tail(path.join(self.env.cwd, 'logs/latest.log'));
    } catch (e) {
      callback(true);
      return;
    }

    const timeout = setTimeout(function () {
      new_tail.unwatch();
      callback(true);
    }, TIMEOUT_LENGTH);

    new_tail.on('line', function(data) {
      const match = data.match(/INFO]: Saved the world/);
      if (match) { //previously on, return true
        clearTimeout(timeout);
        new_tail.unwatch();
        callback(null);
      }
    })

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, 'up'),
      async.apply(self.stuff, 'save-all')
    ], function(err) {
      if (err) {
        clearTimeout(timeout);
        new_tail.unwatch();
        callback(true);
      }
    });
  }

  self.archive = function(callback) {
    const strftime = require('strftime');
    const binary = which.sync('tar');
    const filename = `server-${self.server_name}_${strftime('%Y-%m-%d_%H:%M:%S')}.tgz`;
    const args = ['czf', path.join(self.env.awd, filename), '.'];

    const params = {cwd: self.env.cwd};

    async.series([
      function(cb) {
        self.property('owner', function(err, result) {
          params['uid'] = result['uid'];
          params['gid'] = result['gid'];
          cb(err);
        })
      },
      function(cb) {
        const proc = child_process.spawn(binary, args, params);
        proc.once('exit', code => cb(null, code))
      }
    ], callback);
  }

  self.archive_with_commit = function(callback) {
    const strftime = require('strftime');
    const binary = which.sync('tar');
    const filename = `server-${self.server_name}_${strftime('%Y-%m-%d_%H:%M:%S')}.tgz`;
    const args = ['czf', path.join(self.env.awd, filename), '.'];

    const params = {cwd: self.env.cwd};
    let autosave = true;

    async.series([
      function(cb) {
        self.property('autosave', function(err, result) {
          autosave = result;
          cb(err);
        })
      },
      async.apply(self.stuff, 'save-off'),
      async.apply(self.saveall_latest_log),
      function(cb) {
        self.property('owner', function(err, result) {
          params['uid'] = result['uid'];
          params['gid'] = result['gid'];
          cb(err);
        })
      },
      function(cb) {
        const proc = child_process.spawn(binary, args, params);
        proc.once('exit', function(code) {
          cb(null);
        })
      },
      function(cb) {
        if (autosave)
          self.stuff('save-on', cb);
        else
          cb(null);
      }
    ], callback);
  }

  self.backup = function(callback) {
    const binary = which.sync('rdiff-backup');
    const args = ['--exclude', path.join(self.env.cwd, 'dynmap'), `${self.env.cwd}/`, self.env.bwd];
    const params = {cwd: self.env.bwd}; //bwd!

    async.series([
      function(cb) {
        self.property('owner', function(err, result) {
          params['uid'] = result['uid'];
          params['gid'] = result['gid'];
          cb(err);
        })
      },
      function(cb) {
        const proc = child_process.spawn(binary, args, params);
        proc.once('exit', code => cb(null, code))
      }
    ], callback)
  }

  self.restore = function(step, callback) {
    const binary = which.sync('rdiff-backup');
    const args = ['--restore-as-of', step, '--force', self.env.bwd, self.env.cwd];
    const params = {cwd: self.env.bwd};

    const proc = child_process.spawn(binary, args, params);
    proc.once('exit', function(code) {
      callback(code);
    })
  }

  self.list_increments = function(callback) {
    const binary = which.sync('rdiff-backup');
    const args = ['--list-increment-sizes', self.env.bwd];
    const params = {cwd: self.env.bwd};
    const regex = /^(\w.*?) {3,}(.*?) {2,}([^ ]+ \w*)/;
    const increment_lines: any[] = [];

    const rdiff = child_process.spawn(binary, args, params);

    rdiff.stdout.on('data', function(data) {
      const buffer = Buffer.from(data, 'ascii');
      const lines = buffer.toString('ascii').split('\n');
      let incrs = 0;

      for (let i=0; i < lines.length; i++) {
        const match = lines[i].match(regex);
        if (match) {
          increment_lines.push({
            step: `${incrs}B`,
            time: match[1],
            size: match[2],
            cum: match[3]
          });
          incrs += 1;
        }
      }
    });

    rdiff.on('error', () => {
      // branch if path does not exist
        callback(true, []);
    });

    rdiff.on('exit', function(code) {
      if (code == 0) // branch if all is well
        callback(code, increment_lines);
      else // branch if dir exists, not an rdiff-backup dir
        callback(true, []);
    });
  }

  self.list_archives = function(callback) {
    const fs = require('fs');
    const awd = self.env['awd'];
    const all_info: any[] = [];

    fs.readdir(awd, function(err, files) {
      if (!err) {
        const fullpath = files.map(function (value, index) {
          return path.join(awd, value);
        });

        const stat = fs.stat;
        async.map(fullpath, stat, (inner_err, results: Array<Stats | undefined> | undefined) => {
          if (results !== undefined) {
            results.forEach((value, index) => {
              all_info.push({
                time: value?.mtime,
                size: value?.size,
                filename: files[index]
              })
            })

            all_info.sort(function(a, b) {
              return b.time.getTime() - a.time.getTime();
            });
          }

          callback(err || inner_err, all_info);
        });
      } else {
        callback(err, all_info);
      }
    })
  }

  self.prune = function(step, callback) {
    const binary = which.sync('rdiff-backup');
    const args = ['--force', '--remove-older-than', step, self.env.bwd];
    const params = {cwd: self.env.bwd};
    const proc = child_process.spawn(binary, args, params);

    proc.on('error', function(code) {
      callback(code, null);
    })

    proc.on('error', function() {
      // branch if path does not exist
        callback(true);
    });

    proc.on('exit', function(code) {
      if (code == 0) // branch if all is well
        callback(code);
      else // branch if dir exists, not an rdiff-backup dir
        callback(true);
    });
  }

  self.delete_archive = function(filename, callback) {
    const fs = require('fs-extra');
    const archive_path = path.join(self.env['awd'], filename);

    fs.remove(archive_path, function(err) {
      callback(err);
    })
  }

  self.property = function(property, callback) {
    let timer;
      let DU_TIMEOUT;
      switch(property) {
      case 'owner':
        const userid = require('userid');
        fs.stat(self.env.cwd, function(err, stat_info) {
          if (err)
            callback(err, {});
          else {
            try {
              callback(err, {
                uid: stat_info['uid'],
                gid: stat_info['gid'],
                username: userid.username(stat_info['uid']),
                groupname: userid.groupname(stat_info['gid'])
              });
            } catch (e) {
              callback(err, {
                uid: stat_info['uid'],
                gid: stat_info['gid'],
                username: '?',
                groupname: '?'
              });
            }
          }
        })
        break;
      case 'owner_uid':
        fs.stat(self.env.cwd, function(err, stat_info) {
          if (err)
            callback(err, null);
          else
            callback(err, stat_info['uid']);
        })
        break;
      case 'owner_gid':
        fs.stat(self.env.cwd, function(err, stat_info) {
          if (err)
            callback(err, null);
          else
            callback(err, stat_info['gid']);
        })
        break;
      case 'exists':
        fs.stat(self.env.sp, function(err, stat_info) {
          callback(null, !!stat_info);
        });
        break;
      case '!exists':
        fs.stat(self.env.sp, function(err, stat_info) {
          callback(null, !stat_info);
        });
        break;
      case 'up':
        var pids = MINE_OS.server_pids_up();
        callback(null, self.server_name in pids);
        break;
      case '!up':
        var pids = MINE_OS.server_pids_up();
        callback(null, !(self.server_name in pids));
        break;
      case 'java_pid':
        var pids = MINE_OS.server_pids_up();
        try {
          callback(null, pids[self.server_name]['java']);
        } catch (e) {
          callback(true, null);
        }
        break;
      case 'screen_pid':
        var pids = MINE_OS.server_pids_up();
        try {
          callback(null, pids[self.server_name]['screen']);
        } catch (e) {
          callback(true, null);
        }
        break;
      case 'server-port':
        var sp = self.sp(function(err, dict) {
          callback(err, dict['server-port']);
        })
        break;
      case 'server-ip':
        var sp = self.sp(function(err, dict) {
          callback(err, dict['server-ip']);
        })
        break;
      case 'memory':
        var pids = MINE_OS.server_pids_up();
        if (self.server_name in pids) {
          const procfs = require('procfs-stats');
          procfs.PROC = PROC_PATH; //procfs will default to /proc--this is determined more accurately by mineos.js!
          const ps = procfs(pids[self.server_name]['java']);
          ps.status(function(err, data){
            callback(err, data);
          })
        } else {
          callback(true, null);
        }
        break;
      case 'ping':
        async.waterfall([
          async.apply(self.sc),
          function(sc_data, cb) {
            const jarfile = (sc_data.java || {}).jarfile;

            if (jarfile && jarfile.slice(-5).toLowerCase() == '.phar')
              cb(true, null);
            else {
              const pids = MINE_OS.server_pids_up();
              if (self.server_name in pids) {
                self.ping(function(err, ping){
                  cb(null, ping);
                })
              } else {
                cb(true, null);
              }
            }
          }
        ], callback)
        break;
      case 'query':
        self.query(function(err, dict) {
          callback(err, dict);
        })
        break;
      case 'server.properties':
        self.sp(function(err, dict) {
          callback(err, dict);
        })
        break;
      case 'server.config':
        self.sc(function(err, dict) {
          callback(err, dict);
        })
        break;
      case 'du_awd':
        try {
            DU_TIMEOUT = 2000;

          timer = setTimeout(function() {
            timer = null;
            return(callback(null, 0));
          }, DU_TIMEOUT);

          du(self.env.awd, { disk: true }, function (err, size) {
            clearTimeout(timer);
            if (timer)
              return(callback(err, size));
          })
        } catch (e) {
          callback(null, 0);
        }
        break;
      case 'du_bwd':
        try {
            DU_TIMEOUT = 3000;

            timer = setTimeout(function () {
                timer = null;
                return (callback(null, 0));
            }, DU_TIMEOUT);

            du(self.env.bwd, { disk: true }, function (err, size) {
            clearTimeout(timer);
            if (timer)
              return(callback(err, size));
          })
        } catch (e) {
          callback(null, 0);
        }
        break;
      case 'du_cwd':
        try {
          DU_TIMEOUT = 3000;

          timer = setTimeout(function() {
            timer = null
            return(callback(null, 0));
          }, DU_TIMEOUT);

          du(self.env.cwd, { disk: true }, function (err, size) {
            clearTimeout(timer);
            if (timer)
              return(callback(err, size));
          })
        } catch (e) {
          callback(null, 0);
        }
        break;
      case 'broadcast':
        self.sc(function(err, dict) {
          callback(err, (dict['minecraft'] || {}).broadcast);
        })
        break;
      case 'onreboot_start':
        self.sc(function(err, dict) {
          const val = (dict['onreboot'] || {}).start;
          try {
            const boolean_ified = (val === true) || JSON.parse(val.toLowerCase());
            callback(err, boolean_ified);
          } catch (e) {
            callback(err, false);
          }
        })
        break;
      case 'unconventional':
        self.sc(function(err, dict) {
          callback(err, !!(dict['minecraft'] || {}).unconventional);
        })
        break;
      case 'commit_interval':
        self.sc(function(err, dict) {
          const interval = parseInt((dict['minecraft'] || {})['commit_interval']);
          if (interval > 0)
            callback(null, interval);
          else
            callback(null, null);
        })
        break;
      case 'eula':
        fs.readFile(path.join(self.env.cwd, 'eula.txt'), function(err, data) {
          if (err) {
            callback(null, undefined);
          } else {
            const REGEX_EULA_TRUE = /eula\s*=\s*true/i;
            const lines = data.toString().split('\n');
            let matches = false;
            for (let i in lines) {
              if (lines[i].match(REGEX_EULA_TRUE))
                matches = true;
            }
            callback(null, matches);
          }
        })
        break;
      case 'server_files':
        const server_files: string[] = [];

        async.waterfall([
          async.apply(fs.readdir, self.env.cwd),
          function(sf, cb) {
            server_files.push.apply(server_files, sf.filter(function(file) {
              return file.substr(-4).toLowerCase() == '.jar';
            }))
            server_files.push.apply(server_files, sf.filter(function(file) {
              return file.substr(-5).toLowerCase() == '.phar';
            }))
            server_files.push.apply(server_files, sf.filter(function(file) {
              return file == 'Cuberite';
            }))
            cb();
          },
          async.apply(self.sc),
          function(sc_data, cb) {
            let active_profile_dir = '';
            try {
              active_profile_dir = path.join(self.env.pwd, sc_data.minecraft.profile);
            } catch (e) {
              cb();
              return;
            }

            fs.readdir(active_profile_dir, (err, files) => {
              if (err) {
                cb();
              } else {
                server_files.push.apply(server_files, files.filter((file: string) => ((file.substr(-4).toLowerCase() == '.jar' && server_files.indexOf(file) < 0)
                    || (file.substr(-5).toLowerCase() == '.phar' && server_files.indexOf(file) < 0)
                    || (file == 'Cuberite' && server_files.indexOf(file) < 0))))
                cb();
              }
            })
          }
        ], function(err) {
          callback(err, server_files);
        })
        break;
      case 'autosave':
        const TIMEOUT_LENGTH = 2000;
        const tail = require('tail').Tail;
        const new_tail = new tail(path.join(self.env.cwd, 'logs/latest.log'));

        const timeout = setTimeout(function () {
          new_tail.unwatch();
          return callback(null, true); //default to true for unsupported server functionality fallback
        }, TIMEOUT_LENGTH);

        new_tail.on('line', function(data) {
          var match = data.match(/INFO]: Saving is already turned on/);
          if (match) { //previously on, return true
            clearTimeout(timeout);
            new_tail.unwatch();
            return callback(null, true);
          }
          var match = data.match(/INFO]: Turned on world auto-saving/);
          if (match) { //previously off, return false
            clearTimeout(timeout);
            new_tail.unwatch();

            self.stuff('save-off', function() { //reset initial state
              return callback(null, false); //return initial state
            });
          }
        })

        self.stuff('save-on');
        break;
      case 'FTBInstall.sh':
        fs.stat(path.join(self.env.cwd, 'FTBInstall.sh'), function(err, stat_data) {
          callback(null, !!stat_data);
        })
        break;
      default:
        callback(true, undefined);
        break;
    }
  }

  self.verify = function(test, callback) {
    self.property(test, function(err, result) {
      if (err || !result)
        callback(test);
      else
        callback(null);
    })
  }

  self.ping = function(callback) {
    function swapBytes(buffer) {
      //http://stackoverflow.com/a/7460958/1191579
      const l = buffer.length;
      if (l & 0x01) {
        throw new Error('Buffer length must be even');
      }
      for (let i = 0; i < l; i += 2) {
        const a = buffer[i];
        buffer[i] = buffer[i+1];
        buffer[i+1] = a;
      }
      return buffer;
    }

    function splitBuffer(buf, delimiter) {
      //http://stackoverflow.com/a/8920913/1191579
      const arr: any[] = [];
      let p = 0;

      for (var i = 0, l = buf.length; i < l; i++) {
        if (buf[i] !== delimiter) continue;
        if (i === 0) {
          p = 1;
          continue; // skip if it's at the start of buffer
        }
        arr.push(buf.slice(p, i));
        p = i + 1;
      }

      // add final part
      if (p < l) {
        arr.push(buf.slice(p, l));
      }

      return arr;
    }

    function buffer_to_ascii(buf) {
      let retval = '';
      for (let i=0; i < buf.length; i++)
        retval += (buf[i] == 0x0000 ? '' : String.fromCharCode(buf[i]));
      return retval;
    }

    function send_query_packet(port) {
      const socket = net.connect({port: port});
      const query = 'modern';
      const QUERIES = {
        'modern': '\xfe\x01',
        'legacy': '\xfe' +
            '\x01' +
            '\xfa' +
            '\x00\x06' +
            '\x00\x6d\x00\x69\x00\x6e\x00\x65\x00\x6f\x00\x73' +
            '\x00\x19' +
            '\x49' +
            '\x00\x09' +
            '\x00\x6c\x00\x6f\x00\x63\x00\x61\x00\x6c\x00\x68' +
            '\x00\x6f\x00\x73\x00\x74' +
            '\x00\x00\x63\xdd'
      };

      socket.setTimeout(2500);

      socket.on('connect', function() {
        const buf = Buffer.alloc(2);

        buf.write(QUERIES[query], 0, QUERIES[query].length, 'binary');
        socket.write(buf);
      });

      socket.on('data', function(data) {
        socket.end();

        const legacy_split = splitBuffer(data, 0x00a7);
        const modern_split = swapBytes(data.slice(3)).toString('ucs2').split('\u0000').splice(1);

        if (modern_split.length == 5) {
          // modern ping to modern server
          callback(null, {
            protocol: parseInt(modern_split[0]),
            server_version: modern_split[1],
            motd: modern_split[2],
            players_online: parseInt(modern_split[3]),
            players_max: parseInt(modern_split[4])
          });
        } else if (legacy_split.length == 3) {
          if (String.fromCharCode(legacy_split[0][-1]) == '\u0000') {
            // modern ping to legacy server
            callback(null, {
              protocol: '',
              server_version: '',
              motd: buffer_to_ascii(legacy_split[0].slice(3, legacy_split[0].length-1)),
              players_online: parseInt(buffer_to_ascii(legacy_split[1])),
              players_max: parseInt(buffer_to_ascii(legacy_split[2]))
            });
          }
        }
      });

      socket.on('error', function(err) {
        console.error('error:', err);
        callback(err, null);
      })
    }

    self.sp(function(err, dict) {
      send_query_packet(dict['server-port']);
    })
  }

  self.query = function(callback) {
    const mcquery = require('mcquery');

    let q: any = null;
    let retval = {};

    async.waterfall([
      async.apply(self.sc),
      function(dict, cb) {
        const jarfile = (dict.java || {}).jarfile;
        if (jarfile)
          cb(jarfile.slice(-5).toLowerCase() == '.phar');
        else
          cb(true);
      },
      async.apply(self.property, 'server-port'),
      function(port, cb) {
        q = new mcquery('localhost', port);
        cb();
      },
      function(cb) {
        q.connect(function(err){
        if (err || !q.online)
          cb(err);
        else
          q.full_stat(cb);
        });
      },
      function(pingback, cb) {
        retval = pingback;
        cb();
      }
    ], function(err) {
      try { q.close() } catch (e) {}
      callback(null, retval);
    })
  }

  self.previous_version = function(filepath, restore_as_of, callback) {
    const tmp = require('tmp');
    const binary = which.sync('rdiff-backup');
    const abs_filepath = path.join(self.env.bwd, filepath);

    tmp.file(function (err, new_file_path, fd, cleanupCallback) {
      if (err) throw err;

      const args = ['--force', '--restore-as-of', restore_as_of, abs_filepath, new_file_path];
      const params = {cwd: self.env.bwd};
      const proc = child_process.spawn(binary, args, params);

      proc.on('error', function(code) {
        callback(code, null);
      })

      proc.on('exit', function(code) {
        if (code == 0) {
          fs.readFile(new_file_path, function (inner_err, data) {
            callback(inner_err, data.toString());
          })
        } else {
          callback(code, null);
        }
      })
    });
  }

  self.previous_property = function(restore_as_of, callback) {
    self.previous_version('server.properties', restore_as_of, function(err, file_contents) {

      if (err) {
        callback(err, null)
      } else {
        const ini = require('ini');
        callback(err, ini.decode(file_contents));
      }
    });
  }

  self.chown = function(uid, gid, callback) {
    const auth = require('./auth');
    const chownr = require('chownr');

    async.series([
      async.apply(auth.verify_ids, uid, gid),
      async.apply(self.verify, 'exists'),
      async.apply(chownr, self.env.cwd, uid, gid),
      async.apply(chownr, self.env.bwd, uid, gid),
      async.apply(chownr, self.env.awd, uid, gid)
    ], callback)
  }

  self.sync_chown = function(callback) {
    // chowns awd,bwd,cwd to the owner of cwd.
    // duplicates functionality of chown because it does not assume sp existence
    const chownr = require('chownr');

    async.series([
      async.apply(fs.stat, self.env.cwd),
      function(cb) {
        fs.stat(self.env.cwd, function(err, stat_info) {
          async.series([
            async.apply(fs.ensureDir, self.env.bwd),
            async.apply(fs.ensureDir, self.env.awd),
            async.apply(chownr, self.env.cwd, stat_info.uid, stat_info.gid),
            async.apply(chownr, self.env.bwd, stat_info.uid, stat_info.gid),
            async.apply(chownr, self.env.awd, stat_info.uid, stat_info.gid),
          ], cb)
        })
      }
    ], callback)
  }

  self.run_installer = function(callback) {
    const args = ['FTBInstall.sh'];
    const params = {cwd: self.env.cwd};

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, '!up'),
      async.apply(self.property, 'owner'),
      function(owner, cb) {
        params['uid'] = owner['uid'];
        params['gid'] = owner['gid'];
        cb();
      },
      async.apply(which, 'sh'),
      function(binary, cb) {
        const proc = child_process.spawn(binary, args, params);
        proc.once('close', cb);
      }
    ], callback)
  }

  self.renice = function(niceness, callback) {
    let binary: any = null;
    const params = {cwd: self.env.cwd};

    async.waterfall([
      async.apply(self.verify, 'exists'),
      async.apply(self.verify, 'up'),
      async.apply(self.property, 'owner'),
      function(owner, cb) {
        params['uid'] = owner['uid'];
        params['gid'] = owner['gid'];
        cb();
      },
      async.apply(which, 'renice'),
      function(bin, cb) {
        binary = bin;
        cb();
      },
      async.apply(self.property, 'java_pid')
    ], function(err, pid) {
      if (!err) {
        const proc = child_process.spawn(binary, ["-n", niceness, "-p", pid], params);
        proc.once('close', callback);
      } else {
        callback(true);
      }
    })
  }

  return self;
}
