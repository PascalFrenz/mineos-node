import { Component, OnDestroy } from '@angular/core';
import { faMemory } from '@fortawesome/free-solid-svg-icons';
import { BehaviorSubject, Subscription } from 'rxjs';
import { HostHeartbeat } from 'src/app/models/host-heartbeat';
import { MineosSocketService } from 'src/app/services/mineos-socket.service';

@Component({
  selector: 'app-memory-card',
  template: `
      <app-mini-card [icon]="faMemory"
                     [value]="(serverMemory$ | async | bytes_to_mb) ?? 'n/a'"
                     color="green"
                     text="RAM Free">
      </app-mini-card>
  `,
  styleUrls: []
})
export class MemoryCardComponent implements OnDestroy {

  faMemory = faMemory;

  sub$: Subscription;
  serverMemory$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  constructor(private mineosSocket: MineosSocketService) {
    this.sub$ = this.mineosSocket.hostHeartbeat().subscribe((data: HostHeartbeat) => {
      this.serverMemory$.next(data.freemem);
    })
  }

  ngOnDestroy(): void {
    this.sub$.unsubscribe();
  }
}
