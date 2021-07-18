import { Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';

@Injectable({
  providedIn: 'root'
})
export class ServerSocketWrapperService extends Socket {

  constructor() {
    super({ url: '/Test', options: {} } as SocketIoConfig)
   }
}
