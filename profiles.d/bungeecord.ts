import {DEFAULT_PROFILE, Profile} from "./template";
import path from "path";
import fs from "fs-extra";
import xml_parser from "xml2js";
import {ProfileDefinition} from "./profiles";

export const BungeeCord: ProfileDefinition = {
  name: 'BungeeCord',
  request_args: {
    url: 'http://ci.md-5.net/job/BungeeCord/rssAll',
    json: false
  },
  handler: function (profile_dir, body, callback) {
    const p: Profile[] = [];

    try {
      xml_parser.parseString(body, (inner_err, result) => {
        try {
          const packs = result['feed']['entry'];

          for (let index in packs) {
            const item = Object.assign({}, DEFAULT_PROFILE);

            item['version'] = packs[index]['id'][0].split(':').slice(-1)[0];
            item['group'] = 'bungeecord';
            item['type'] = 'release';
            item['id'] = `BungeeCord-${item.version}`;
            item['webui_desc'] = packs[index]['title'][0];
            item['weight'] = 5;
            item['filename'] = `BungeeCord-${item.version}.jar`;
            item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
            item['url'] = `http://ci.md-5.net/job/BungeeCord/${item.version}/artifact/bootstrap/target/BungeeCord.jar`;
            p.push(item);
          }
          callback(inner_err, p);
        } catch (e) { }
      })

    } catch (e) { console.log(e) }

    callback(null, p);
  } //end handler
}