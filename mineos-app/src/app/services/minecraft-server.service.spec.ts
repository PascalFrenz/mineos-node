import { TestBed } from '@angular/core/testing';

import { MinecraftServerService } from './minecraft-server.service';

describe('MinecraftServerService', () => {
  let service: MinecraftServerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MinecraftServerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
