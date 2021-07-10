import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { MockLocationStrategy } from '@angular/common/testing';
import { LocationStrategy } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers:[{ provide: LocationStrategy, useClass: MockLocationStrategy }],
      declarations: [
        AppComponent
      ],
      imports:[RouterTestingModule],
      // Note: CUSTOM_ELEMENTS_SCHEMA ignores parsing of sub components. It would be better to test the
      // full parsing of the html. however <app-header> currently does not have any input/output to test.
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'mineos-app'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('mineos-app');
  });
});
