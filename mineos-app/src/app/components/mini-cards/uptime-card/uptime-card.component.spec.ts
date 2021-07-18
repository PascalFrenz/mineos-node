import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UptimeCardComponent } from './uptime-card.component';

describe('UptimeCardComponent', () => {
  let component: UptimeCardComponent;
  let fixture: ComponentFixture<UptimeCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ UptimeCardComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UptimeCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
