import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Location } from '@angular/common';
import { AuthGuard } from './auth.guard';
import { routes } from './app-routing.module';
import { AuthenticationService } from './services/authentication.service';
import { Router } from '@angular/router';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;
  let router: Router;

  beforeEach(() => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['isAuthenticated']
    );
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes(routes)],
      providers: [
        { provide: AuthenticationService, useValue: mockAuthenticationService },
      ],
    });
    guard = TestBed.inject(AuthGuard);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('should redirect an unauthenticated user to the login route', () => {
    mockAuthenticationService.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate()).toEqual(false);
    expect(router.navigate).toHaveBeenCalledWith(['/ui/login']);
  });

  it('should allow the authenticated user to access app', () => {
    mockAuthenticationService.isAuthenticated.and.returnValue(true);
    expect(guard.canActivate()).toEqual(true);
  });
});
