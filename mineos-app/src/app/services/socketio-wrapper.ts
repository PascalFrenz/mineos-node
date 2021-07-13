import { Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';

@Injectable({
  providedIn: 'root',
})
export class SocketioWrapper extends Socket {

  constructor() {
    super({ url: '', options: {} } as SocketIoConfig)
   }
}
