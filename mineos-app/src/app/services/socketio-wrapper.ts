import { Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';

// Due to the use of namespaced sockets the socket needs to be managed manulally
// @Injectable({
//   providedIn: 'root',
// })
export class SocketioWrapper extends Socket {

  constructor(socketConfig: SocketIoConfig) {
    super(socketConfig)
   }
}
