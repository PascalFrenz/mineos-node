import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthGuard } from './auth.guard';
import { AuthenticationService } from './services/authentication.service';
import { Router } from '@angular/router';
import { LoginComponent } from './components/login/login.component';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;
  let routerMock: jasmine.SpyObj<Router>;
  let routeMock: any = { snapshot: {}};
  let routeStateMock: any = { snapshot: {}, url: 'login'};

  beforeEach(() => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',{
        isAuthenticated: true
      }
    );
    routerMock = jasmine.createSpyObj<Router>(
      'Router',{
        navigate:Promise.resolve(true)
      }
    );
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([{ path: 'login', component: LoginComponent }])],
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: AuthenticationService, useValue: mockAuthenticationService },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('should redirect an unauthenticated user to the login route', () => {
    mockAuthenticationService.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate(routeMock, routeStateMock)).toEqual(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['login']);
  });

  it('should allow the authenticated user to access app', () => {
    expect(guard.canActivate(routeMock, routeStateMock)).toEqual(true);
  });

  it('should allow the authenticated user to access child routes', () => {
    expect(guard.canActivateChild(routeMock, routeStateMock)).toEqual(true);
  });
});
