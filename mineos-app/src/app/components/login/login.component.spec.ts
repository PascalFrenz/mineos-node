import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

import { LoginComponent } from './login.component';
import { LoginRequest } from 'src/app/models/login-request';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;

  beforeEach(async () => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      {
        isLoggedIn: of(false),
        loginUser: of(true),
        logoutUser: of(true),
      }
    );
    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      providers: [
        FormBuilder,
        { provide: AuthenticationService, useValue: mockAuthenticationService },
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

  it('should call AuthenticationService login', () => {
    component.login();
    expect(mockAuthenticationService.loginUser).toHaveBeenCalledWith({
      username: 'jdoe',
      password: 'minecraft'
    } as LoginRequest);
  })
});
