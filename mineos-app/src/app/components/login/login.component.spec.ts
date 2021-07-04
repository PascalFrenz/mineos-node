import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import {Location} from "@angular/common";
import { of } from 'rxjs';
import { User } from '../../models/user';
import { AuthenticationService } from '../../services/authentication.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

import { LoginComponent } from './login.component';
import { LoginRequest } from 'src/app/models/login-request';
import { routes } from '../../app-routing.module';
import { AuthGuard } from 'src/app/auth.guard';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;
  let mockAuthGuard: jasmine.SpyObj<AuthGuard>;

  beforeEach(async () => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      {
        isAuthenticated: false,
        loginUser: of({ username: 'jdoe' } as User),
        logoutUser: of({} as User),
      }
    );
    mockAuthGuard = jasmine.createSpyObj<AuthGuard>('AuthGuard',{
      canActivate:of(true)
    })
    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [
        RouterTestingModule.withRoutes(routes),
      ],
      providers: [
        FormBuilder,
        { provide: AuthenticationService, useValue: mockAuthenticationService },
        { provide: AuthGuard, useValue: mockAuthGuard },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    component.loginForm = new FormGroup({
      username: new FormControl('jdoe', Validators.required),
      password: new FormControl('minecraft', Validators.required),
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should navigate to /ui/dashboard on successful login', fakeAsync(() => {
    let location = TestBed.inject(Location);
    component.login();
    tick();
    expect(mockAuthenticationService.loginUser).toHaveBeenCalledWith({
      username: 'jdoe',
      password: 'minecraft'
    } as LoginRequest);
    expect(location.path()).toBe('/ui/dashboard')
  }))
});
