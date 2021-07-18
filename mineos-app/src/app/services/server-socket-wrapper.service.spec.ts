import { TestBed } from '@angular/core/testing';

import { ServerSocketWrapperService } from './server-socket-wrapper.service';

describe('ServerSocketWrapperService', () => {
  let service: ServerSocketWrapperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ServerSocketWrapperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
