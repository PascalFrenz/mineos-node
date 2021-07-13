import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Heartbeat } from '../models/heartbeat.model';
import { SocketioWrapper } from './socketio-wrapper';

@Injectable({
  providedIn: 'root',
})
export class MineosSocketService {

  username: any;
  commit_msg: string = '';
  git_commit: any;
  host_heartbeat: any;
  profiles: any;
  buildtools_jar: any;
  papertools_jar: any;
  users: any;
  groups: any;
  archive_list: any;
  spigot_list: any;
  locale_list: any;
  build_jar_log: any;
  columns: any;

  loadavg = [];
  loadavg_options = {
    // element: $("#load_averages"),
    fallback_xaxis_max: 1,
    series: {
      lines: {
        show: true,
        fill: 0.5,
      },
      shadowSize: 0,
    },
    yaxis: { min: 0, max: 1 },
    xaxis: { min: 0, max: 30, show: false },
    grid: { borderWidth: 0 },
  };

  constructor(private socket: SocketioWrapper) {}

  public sendMessage(message: string) {
    console.log(`host_heartbeat ${message}`);
    this.socket.emit('host_heartbeat', message);
  }
  // hostHeartbeat() {
  //   return this.socket.fromEvent('host_heartbeat').pipe(
  //     map((data: any) => {
  //       console.log(`getMessage() received ${data}`);
  //       return [data];
  //     })
  //   );
  // }

  /* socket handlers */

  whoami() {
    return this.socket.fromEvent('whoami')
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

  hostHeartbeat() {
    return this.socket.fromEvent('host_heartbeat');
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
