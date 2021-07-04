import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AuthenticationService } from './authentication.service';
import { User } from '../models/user';
import { LoginRequest } from '../models/login-request';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(AuthenticationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set loggedUser on login', () => {
    let login: LoginRequest = {
      username: 'jdoe',
      password: 'minecraft'
    } as LoginRequest;
    let user: User = {
      username: 'jdoe'
    } as User;

    service.loginUser(login).subscribe((response)=>{
      expect(response).toEqual(user)
    });
    const request = httpMock.expectOne(`/auth`);
    expect(request.request.method).toBe('POST');
    request.flush(user);
    expect(service['loggedUser']).toEqual(user);
  });

  it('should clear loggedUser on logout', () => {
    let user: User = {
      username: 'jdoe'
    } as User;

    service.logoutUser().subscribe((response)=>{
      expect(response).toEqual(user)
    });
    const request = httpMock.expectOne(`/logout`);
    expect(request.request.method).toBe('GET');
    request.flush(user);
    expect(service['loggedUser']).toEqual(undefined);
  });

  it('should check loggedUser is set when Authenticated', () => {
    service['loggedUser'] = {
      username: 'jdoe'
    } as User;
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should check loggedUser is not set when not Authenticated', () => {
    service['loggedUser'] = undefined;
    expect(service.isAuthenticated()).toBe(false);
  });
});
