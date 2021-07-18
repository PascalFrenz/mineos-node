import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SocketioWrapper } from './socketio-wrapper';
import { Socket, SocketIoConfig } from 'ngx-socket-io';
import { ServerHeartbeat } from '../models/server-heartbeat';
import { HostHeartbeat } from '../models/host-heartbeat';

@Injectable({
  providedIn: 'root',
})
export class MineosSocketService implements OnDestroy {
  serverNames$: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  sub$: Subscription;
  server: Map<string, SocketioWrapper> = new Map<string, SocketioWrapper>();

  constructor(private socket: Socket) {
    this.socket = new SocketioWrapper({ url: '', options: {} });
    this.sub$ = this.trackServer().subscribe((serverName) => {
      console.log(`connecting to namespace ${serverName}`)
      if (!this.server.has(serverName)) {
        this.server.set(
          serverName,
          new SocketioWrapper({
            url: `/${serverName}`,
            options: {},
          })
        );
        let serverNameList = this.serverNames$.value;
        serverNameList.push(serverName);
        this.serverNames$.next(serverNameList);
      }
    });
  }
  serverList(): Observable<string[]> {
    return this.serverNames$.asObservable();
  }

  ngOnDestroy(): void {
    this.sub$.unsubscribe();
    this.server.forEach((namespace) => {
      namespace.disconnect();
    });
    this.socket.disconnect();
  }

  /* socket handlers */

  whoami() {
    return this.socket.fromEvent('whoami');
    // .pipe(
    //   map((username) => {
    //     console.log(`whoami() received ${username}`);
    //     this.username = username;
    //   })
    // );
  }

  commitMsg() {
    return this.socket.fromEvent<string>('commit_msg');
    // .pipe(
    //   map((commit_msg) => {
    //     console.log(`commitMsg() received ${commit_msg}`);
    //     console.log(commit_msg);
    //     this.commit_msg = commit_msg;
    //     this.git_commit = commit_msg.split(' ')[0];
    //   })
    // );
  }

  hostHeartbeat() : Observable<HostHeartbeat>{
    return this.socket.fromEvent<HostHeartbeat>('host_heartbeat');
    // .pipe(
    //   map((data) => {
    //     console.log(`hostHeartbeat() received ${data}`);
    //     this.host_heartbeat = data;
    //     // this.update_loadavg(data.loadavg);
    //   })
    // );
  }

  serverHeartbeat(serverName: string): Observable<ServerHeartbeat> {
    let serverSocket = this.server.get(serverName);
    if (serverSocket)
      return serverSocket.fromEvent<ServerHeartbeat>('heartbeat');
    else {
      console.error('not joined to server room');
      return of(new ServerHeartbeat());
    }
    // .pipe(
    //   map((data) => {
    //     console.log(`hostHeartbeat() received ${data}`);
    //     this.host_heartbeat = data;
    //     // this.update_loadavg(data.loadavg);
    //   })
    // );
  }

  trackServer(): Observable<string> {
    return this.socket.fromEvent<string>('track_server');
    // .pipe(
    //   map((data) => {
    //     console.log(`hostHeartbeat() received ${data}`);
    //     this.host_heartbeat = data;
    //     // this.update_loadavg(data.loadavg);
    //   })
    // );
  }

  untrackServer() {
    return this.socket.fromEvent('untrack_server');
    // .pipe(
    //   map((data) => {
    //     console.log(`hostHeartbeat() received ${data}`);
    //     this.host_heartbeat = data;
    //     // this.update_loadavg(data.loadavg);
    //   })
    // );
  }

  profileList() {
    return this.socket.fromEvent('profile_list');
    // .pipe(
    //   map((profile_data: any) => {
    //     console.log(`profileList() received ${profile_data}`);
    //     this.profiles = profile_data;

    //     for (var p in profile_data)
    //       if (profile_data[p].id == 'BuildTools-latest')
    //         this.buildtools_jar = profile_data[p];
    //       else if (profile_data[p].id == 'PaperTools-latest')
    //         this.papertools_jar = profile_data[p];
    //   })
    // );
  }

  userList() {
    return this.socket.fromEvent('user_list');
    // .pipe(
    //   map((user_data) => {
    //     console.log(`userList() received ${user_data}`);
    //     this.users = user_data;
    //   })
    // );
  }

  groupList() {
    return this.socket.fromEvent('group_list');
    // .pipe(
    //   map((group_data) => {
    //     console.log(`groupList() received ${group_data}`);
    //     this.groups = group_data;
    //   })
    // );
  }

  archiveList() {
    return this.socket.fromEvent('archive_list');
    // .pipe(
    //   map((archive_data) => {
    //     console.log(`archiveList() received ${archive_data}`);
    //     this.archive_list = archive_data;
    //   })
    // );
  }

  spigotList() {
    return this.socket.fromEvent('spigot_list');
    // .pipe(
    //   map((spigot_list) => {
    //     console.log(`spigotList() received ${spigot_list}`);
    //     this.spigot_list = spigot_list;
    //   })
    // );
  }

  localeList() {
    return this.socket.fromEvent('locale_list');
    // .pipe(
    //   map((locale_list) => {
    //     console.log(`localeList() received ${locale_list}`);
    //     this.locale_list = locale_list;
    //   })
    // );
  }

  buildJarOutput() {
    return this.socket.fromEvent('build_jar_output');
    // .pipe(
    //   map((data) => {
    //     console.log(`buildJarOutput() received ${data}`);
    //     //removed to allow access to all produced log entries
    //     //while (this.build_jar_log.length > 40)
    //     //  this.build_jar_log.splice(0,1);
    //     this.build_jar_log.push(data);
    //   })
    // );
  }

  hostNotice() {
    return this.socket.fromEvent('host_notice');
    // .pipe(
    //   map((data: any) => {
    //     console.log(`hostNotice() received ${data}`);
    //     var suppress = false;
    //     if ('suppress_popup' in data || data.success) suppress = true;

    //     // $.gritter.add({
    //     //   title: '{0} {1}'.format(
    //     //     data.command,
    //     //     data.success
    //     //       ? $filter('translate')('SUCCEEDED')
    //     //       : $filter('translate')('FAILED')
    //     //   ),
    //     //   text: data.help_text,
    //     // });
    //   })
    // );
  }

  changeLocale() {
    return this.socket.fromEvent('change_locale');
    // .pipe(
    //   map((locale) => {
    //     console.log(`changeLocale() received ${locale}`);
    //     // $translate.use(locale);
    //   })
    // );
  }

  optionalColumns() {
    return this.socket.fromEvent('optional_columns');
    // .pipe(
    //   map((user_data: any) => {
    //     console.log(`optionalColumns() received ${user_data}`);
    //     var columns = [];
    //     if (user_data.length > 0) columns = user_data.split(',');
    //     this.columns = columns;
    //   })
    // );
  }

  fileProgress() {
    return this.socket.fromEvent('file_progress');
    // .pipe(
    //   map((data: any) => {
    //     console.log(`fileProgress() received ${data}`);
    //     for (var p in this.profiles)
    //       if (
    //         data.group == this.profiles[p].group &&
    //         data.id == this.profiles[p].id &&
    //         data.type == this.profiles[p].type
    //       )
    //         this.profiles[p].progress = data.progress;
    //   })
    // );
  }
}
