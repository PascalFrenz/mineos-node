import path from "path";
import fs from "fs-extra";
import async from "async";
import {DEFAULT_PROFILE, Profile} from "./template";
import {ProfileDefinition} from "./profiles";

import child from "child_process";

import which from "which";

export const Cuberite: ProfileDefinition = {
  name: "Cuberite C++ Server",
  request_args: {
    url: 'http://builds.cuberite.org/rssLatest',
    json: false
  },
  handler: (profile_dir, body, callback) => {
    const p: Profile[] = [];

    try {  // BEGIN PARSING LOGIC
      const item = Object.assign({}, DEFAULT_PROFILE);

      item['id'] = 'cuberite-x64-latest';
      item['time'] = new Date().getTime();
      item['releaseTime'] = new Date().getTime();
      item['type'] = 'release';
      item['group'] = 'cuberite';
      item['webui_desc'] = 'Latest Linux x64 release';
      item['weight'] = 0;
      item['filename'] = 'Cuberite.tar.gz';
      item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
      item['version'] = 0;
      item['release_version'] = '';
      item['url'] = 'https://builds.cuberite.org/job/Cuberite%20Linux%20x64%20Master/lastSuccessfulBuild/artifact/Cuberite.tar.gz';
      p.push(JSON.parse(JSON.stringify(item)));

      item['id'] = 'cuberite-x86-latest';
      item['time'] = new Date().getTime();
      item['releaseTime'] = new Date().getTime();
      item['type'] = 'release';
      item['group'] = 'cuberite';
      item['webui_desc'] = 'Latest Linux x86 release';
      item['weight'] = 0;
      item['filename'] = 'Cuberite.tar.gz';
      item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
      item['version'] = 0;
      item['release_version'] = '';
      item['url'] = 'https://builds.cuberite.org/job/Cuberite%20Linux%20x86%20Master/lastSuccessfulBuild/artifact/Cuberite.tar.gz';
      p.push(JSON.parse(JSON.stringify(item)));

      item['id'] = 'cuberite-rpi-latest';
      item['time'] = new Date().getTime();
      item['releaseTime'] = new Date().getTime();
      item['type'] = 'release';
      item['group'] = 'cuberite';
      item['webui_desc'] = 'Latest RPI release';
      item['weight'] = 0;
      item['filename'] = 'Cuberite.tar.gz';
      item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
      item['version'] = 0;
      item['release_version'] = '';
      item['url'] = 'https://builds.cuberite.org/job/Cuberite%20Linux%20raspi-armhf%20Master/lastSuccessfulBuild/artifact/Cuberite.tar.gz';
      p.push(JSON.parse(JSON.stringify(item)));

      item['id'] = 'cuberite-bsd-latest';
      item['time'] = new Date().getTime();
      item['releaseTime'] = new Date().getTime();
      item['type'] = 'release';
      item['group'] = 'cuberite';
      item['webui_desc'] = 'Latest FreeBSD x64 release';
      item['weight'] = 0;
      item['filename'] = 'Cuberite.tar.gz';
      item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
      item['version'] = 0;
      item['release_version'] = '';
      item['url'] = 'https://builds.cuberite.org/job/Cuberite-FreeBSD-x64-Master/lastSuccessfulBuild/artifact/Cuberite.tar.gz';
      p.push(JSON.parse(JSON.stringify(item)));

    } catch (e) {
      console.error(e);
    }

    callback(null, p);
  }, //end handler
  postdownload: (profile_dir, dest_filepath, callback) => {
    const binary = which.sync('tar');
    const args = ['--force-local',
      '-xf', dest_filepath];
    const params = {cwd: profile_dir};

    async.series([
      cb => {
        const proc = child.spawn(binary, args, params);
        proc.once('exit', code => cb(null, code))
      },
      cb => {
        const inside_dir = path.join(profile_dir, 'Server');
        fs.readdir(inside_dir, (err, files) => {
          if (!err)
            async.each(files, (file, inner_cb) => {
              const old_filepath = path.join(inside_dir, file);
              const new_filepath = path.join(profile_dir, file);

              fs.move(old_filepath, new_filepath, inner_cb);
            }, cb);
          else
            cb(err);
        })
      }
    ], callback)
  }
}