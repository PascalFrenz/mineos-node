import { Component, OnDestroy } from '@angular/core';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import { BehaviorSubject, Subscription } from 'rxjs';
import { HostHeartbeat } from 'src/app/models/host-heartbeat';
import { MineosSocketService } from 'src/app/services/mineos-socket.service';

@Component({
  selector: 'app-uptime-card',
  template: `
      <app-mini-card [icon]="faClock"
                     [value]="(serverUptime$ | async | amDuration:'seconds') ?? 'n/a'"
                     color="black"
                     text="Uptime">
      </app-mini-card>
  `,
  styleUrls: []
})
export class UptimeCardComponent implements OnDestroy {

  faClock = faClock;

  sub$: Subscription;
  serverUptime$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  constructor(private mineosSocket: MineosSocketService) {
    this.sub$ = this.mineosSocket.hostHeartbeat().subscribe((data: HostHeartbeat) => {
      this.serverUptime$.next(data.uptime);
    })
  }

  ngOnDestroy(): void {
    this.sub$.unsubscribe();
  }
}
