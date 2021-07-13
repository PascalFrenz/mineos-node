import { TestBed } from '@angular/core/testing';

import { MineosSocketService } from './mineos-socket.service';

describe('MineosSocketService', () => {
  let service: MineosSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MineosSocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
