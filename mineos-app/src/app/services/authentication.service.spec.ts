import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AuthenticationService } from './authentication.service';
import { User } from '../models/user';
import { LoginRequest } from '../models/login-request';
import { RouterTestingModule } from '@angular/router/testing';
import { LoginComponent } from '../components/login/login.component';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([{ path: 'login', component: LoginComponent }]), HttpClientTestingModule],
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

  it('should set currentUser on login', () => {
    let login: LoginRequest = {
      username: 'jdoe',
      password: 'minecraft',
    } as LoginRequest;
    let user: User = {
      username: 'jdoe',
    } as User;

    service.loginUser(login).subscribe((response) => {
      expect(response).toEqual(true);
    });
    const request = httpMock.expectOne(`/api/auth`);
    expect(request.request.method).toBe('POST');
    request.flush(user);
    expect(service['currentUser']).toEqual(user);
  });

  it('should clear currentUser on logout', () => {
    let user: User = {
      username: 'jdoe',
    } as User;

    service.logoutUser().subscribe((response) => {
      expect(response).toEqual(true);
    });
    const request = httpMock.expectOne(`/api/logout`);
    expect(request.request.method).toBe('GET');
    request.flush(user);
    expect(service['currentUser']).toEqual(undefined);
  });

  it('should check currentUser is set when Authenticated', () => {
    service['currentUser'] = {
      username: 'jdoe',
    } as User;
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should check currentUser is not set when not Authenticated', () => {
    service['currentUser'] = undefined;
    expect(service.isAuthenticated()).toBe(false);
  });
});
