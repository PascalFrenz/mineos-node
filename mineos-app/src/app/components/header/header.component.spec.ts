import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ThemeSwitcherService } from '../../services/theme-switcher.service';
import { AuthenticationService } from '../../services/authentication.service';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;
  let mockThemeSwitcherService: jasmine.SpyObj<ThemeSwitcherService>;

  beforeEach(async () => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      {
        isLoggedIn: of(false),
        logoutUser: of(true),
      }
    );

    mockThemeSwitcherService = jasmine.createSpyObj<ThemeSwitcherService>(
      'ThemeSwitcherService',
      ['isDarkMode', 'setMode']
    );
    mockThemeSwitcherService.isDarkMode.and.returnValue(of(false));
    mockThemeSwitcherService.setMode.and.callFake(function (data:boolean) {});

    await TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      providers: [
        { provide: AuthenticationService, useValue: mockAuthenticationService },
        { provide: ThemeSwitcherService, useValue: mockThemeSwitcherService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should logout user', () => {
    let testValue = false;
    mockAuthenticationService.logoutUser.and.returnValue(
      of(testValue).pipe(
        tap((data) => {
          testValue = !data;
        })
      )
    );

    expect(testValue).toBe(false);
    component.logout();
    expect(testValue).toBe(true);
  });

  it('should set the theme mode', () => {
    component.changeMode(true);
    expect(mockThemeSwitcherService.setMode).toHaveBeenCalledWith(true);
  });
});
