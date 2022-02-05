import { Component, OnDestroy } from '@angular/core';
import { faUsers } from '@fortawesome/free-solid-svg-icons';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ServerHeartbeat } from 'src/app/models/server-heartbeat';
import { MineosSocketService } from 'src/app/services/mineos-socket.service';

@Component({
  selector: 'app-player-card',
  template: `
      <app-mini-card [icon]="faUsers" [value]="(activePlayers$ | async) ?? 'n/a'" text="Players Online"></app-mini-card>
  `,
  styleUrls: []
})
export class PlayerCardComponent implements OnDestroy {

  faUsers = faUsers;

  heartbeats: Map<string, Subscription> = new Map<string, Subscription>();
  playerCountMap: Map<string, number> = new Map<string, number>();
  activePlayers$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  constructor(private mineosSocket: MineosSocketService) {
    this.mineosSocket.serverList().subscribe((serverList) => {
      serverList.forEach((serverName) => {
        if (!this.heartbeats.has(serverName)) {
          this.subscribeToHeartbeat(serverName);
        }
      });
    });
  }

  private subscribeToHeartbeat(serverName: string) {
    this.heartbeats.set(
      serverName,
      this.mineosSocket
        .serverHeartbeat(serverName)
        .subscribe((data: ServerHeartbeat) => {
          this.updatePlayerCount(serverName, data);
        })
    );
  }

  private updatePlayerCount(serverName: string, data: ServerHeartbeat) {
    this.playerCountMap.set(
      serverName,
      data.payload.ping.players_online
    );
    let total = 0;
    this.playerCountMap.forEach((mapValue) => {
      if (mapValue) {
        total = total + mapValue;
      }
    });
    this.activePlayers$.next(total);
  }

  ngOnDestroy(): void {
    this.heartbeats.forEach((sub) => {
      sub.unsubscribe();
    });
  }
}
