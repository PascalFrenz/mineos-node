import { Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MineosSocketService } from 'src/app/services/mineos-socket.service';

@Component({
  selector: 'app-active-server-list',
  templateUrl: './active-server-list.component.html',
  styleUrls: ['./active-server-list.component.scss'],
})
export class ActiveServerListComponent implements OnDestroy {
  // public serverList$: BehaviorSubject<MinecraftServer> =
  //   new BehaviorSubject<MinecraftServer>([]);
  private serverSub$: Subscription[];
  newMessage: string = '';
  messageList: Observable<any[]>;

  messages: BehaviorSubject<any[]> = new BehaviorSubject<any[]>([]);
  // currentHeartbeat: any;
  // private heartbeatSub$: Subscription | undefined;

  // constructor(private socket: MineosSocketService) {
  //   console.log('oepning websocket');
  //   // this.heartbeats = of([]);
  //   this.serverSub$ = this.socket.getMessage().subscribe((newMessage) => {
  //     let messages = this.messages.getValue();
  //     messages.push(newMessage);
  //     this.messages.next(messages);
  //   });;
  // }
  constructor(private chatService: MineosSocketService) {
    this.messageList = this.messages.asObservable();
    this.serverSub$ = [
      this.chatService.whoami().subscribe((data) => {
        console.log(`whoami ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.commitMsg().subscribe((data) => {
        console.log(`commitMsg ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.hostHeartbeat().subscribe((data) => {
        console.log(`hostHeartbeat ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.profileList().subscribe((data) => {
        console.log(`profileList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.userList().subscribe((data) => {
        console.log(`userList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.groupList().subscribe((data) => {
        console.log(`groupList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.archiveList().subscribe((data) => {
        console.log(`archiveList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.spigotList().subscribe((data) => {
        console.log(`spigotList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.localeList().subscribe((data) => {
        console.log(`localeList ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.buildJarOutput().subscribe((data) => {
        console.log(`buildJarOutput ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.hostNotice().subscribe((data) => {
        console.log(`hostNotice ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.changeLocale().subscribe((data) => {
        console.log(`changeLocale ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.optionalColumns().subscribe((data) => {
        console.log(`optionalColumns ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
      this.chatService.fileProgress().subscribe((data) => {
        console.log(`fileProgress ${JSON.stringify(data)}`);
        let m = this.messages.getValue();
        m.push(data);
        this.messages.next(m);
      }),
    ];
  }

  ngOnDestroy(): void {
    for (let sub of this.serverSub$) {
      sub.unsubscribe();
    }
  }

  sendMessage() {
    this.chatService.sendMessage(this.newMessage);
    this.newMessage = '';
  }
}
