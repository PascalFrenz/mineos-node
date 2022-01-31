import { LocationStrategy } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MockLocationStrategy } from '@angular/common/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from '../components/dashboard/dashboard.component';
import { LoginComponent } from '../components/login/login.component';

import { AuthenticationService } from './authentication.service';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LocationStrategy, useClass: MockLocationStrategy },
      ],
      imports: [
        RouterTestingModule.withRoutes([
          { path: 'login', component: LoginComponent },
          { path: 'dashboard', component: DashboardComponent },
        ]),
        HttpClientTestingModule,
      ],
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

  it('should should check server session for authentication', fakeAsync(() => {
    let result: boolean = false;
    service.isAuthenticated().subscribe((data) => {
      result = data;
    });
    const request = httpMock.expectOne(`/api/auth/is-authenticated`);
    expect(request.request.method).toBe('GET');
    request.flush({ authenticated: true });
    tick();
    expect(result).toEqual(true);
  }));

  it('should return false if session is not authenticated', fakeAsync(() => {
    let result: boolean = true;
    service.isAuthenticated().subscribe((data) => {
      result = data;
    });
    const request = httpMock.expectOne(`/api/auth/is-authenticated`);
    expect(request.request.method).toBe('GET');
    request.flush({ authenticated: false });
    tick();
    expect(result).toEqual(false);
  }));
});
