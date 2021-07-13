import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MinecraftServer } from '../models/minecraft-server';

@Injectable({
  providedIn: 'root',
})
export class MinecraftServerService {

  constructor() {}

  public getServers(): Observable<MinecraftServer[]> {
    let tempData: MinecraftServer[] = [];
    return of(tempData);
  }
}
