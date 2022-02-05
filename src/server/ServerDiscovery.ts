import { Server } from "socket.io";
import fs from "fs-extra";
import path from "path";
import winston from "winston";
import { ServerContainer } from "./ServerContainer";

export class ServerDiscovery {
  private servers: (ServerContainer | null)[] = [];

  constructor(private server_path: string, private front_end: Server, private user_config: any) {
    const discovered_servers = this.discover();
    for (let i in discovered_servers)
      this.track(discovered_servers[i]);
  }

  public startServerWatcher() {
    fs.watch(this.server_path, () => {
      const current_servers = this.discover();

      for (let i in current_servers)
        if (!(current_servers[i] in this.servers)) //if detected directory not a discovered server, track
          this.track(current_servers[i]);

      for (let s in this.servers)
        if (current_servers.indexOf(s) < 0)
          this.untrack(s);
    });
  }

  private discover() {
    //http://stackoverflow.com/a/24594123/1191579
    return fs.readdirSync(this.server_path).filter((p) => {
      try {
        return fs.statSync(path.join(this.server_path, p)).isDirectory();
      } catch (e) {
        winston.warn(`Filepath ${path.join(this.server_path, p)} does not point to an existing directory`);
      }
    });
  }

  private track(sn) {
    this.servers[sn] = null;
    //if new server_container() isn't instant, double broadcast might trigger this if/then twice
    //setting to null is immediate and prevents double execution
    this.servers[sn] = new ServerContainer(sn, this.user_config, this.front_end);
    this.front_end.emit('track_server', sn);
  }

  private untrack(sn) {
    try {
      this.servers[sn]?.cleanup();
      delete this.servers[sn];
    } catch (e) {
      //if server has already been deleted and this is running for reasons unknown, catch and ignore
    } finally {
      this.front_end.emit('untrack_server', sn);
    }
  }
}

