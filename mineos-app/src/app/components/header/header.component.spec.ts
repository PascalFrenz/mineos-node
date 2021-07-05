import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthenticationService } from '../../services/authentication.service';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let mockAuthenticationService: jasmine.SpyObj<AuthenticationService>;

  beforeEach(async () => {
    mockAuthenticationService = jasmine.createSpyObj<AuthenticationService>('AuthenticationService',{
      logoutUser:of(true)
    })
    await TestBed.configureTestingModule({
      declarations: [ HeaderComponent ],
      providers:[{ provide: AuthenticationService, useValue: mockAuthenticationService}]
    })
    .compileComponents();
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
    mockAuthenticationService.logoutUser.and.returnValue(of(testValue).pipe(tap((data)=>{testValue = !data})))

    expect(testValue).toBe(false);
    component.logout();
    expect(testValue).toBe(true);
  });
});
