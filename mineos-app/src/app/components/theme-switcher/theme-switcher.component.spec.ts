import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { ThemeSwitcherService } from 'src/app/services/theme-switcher.service';

import { ThemeSwitcherComponent } from './theme-switcher.component';

describe('ThemeSwitcherComponent', () => {
  let component: ThemeSwitcherComponent;
  let fixture: ComponentFixture<ThemeSwitcherComponent>;
  let mockThemeSwitcherService: jasmine.SpyObj<ThemeSwitcherService>;

  beforeEach(async () => {
    mockThemeSwitcherService = jasmine.createSpyObj<ThemeSwitcherService>(
      'ThemeSwitcherService',
      ['isDarkMode', 'setMode']
    );
    mockThemeSwitcherService.isDarkMode.and.returnValue(false);
    mockThemeSwitcherService.setMode.and.callFake(function (data: boolean) {});

    await TestBed.configureTestingModule({
      declarations: [ThemeSwitcherComponent],
      providers: [
        { provide: ThemeSwitcherService, useValue: mockThemeSwitcherService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ThemeSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should request dark mode setting on Init', fakeAsync(() => {
    mockThemeSwitcherService.isDarkMode.and.returnValue(true);
    expect(component.isDarkMode).toEqual(false);
    fixture.detectChanges();
    expect(component.isDarkMode).toEqual(true);
    expect(mockThemeSwitcherService.isDarkMode).toHaveBeenCalledTimes(1);
  }));

  it('should set theme mode', () => {
    component.isDarkMode = true;
    component.changeMode();
    expect(component.isDarkMode).toEqual(false);
    expect(mockThemeSwitcherService.setMode).toHaveBeenCalledWith(false);
  });
});
