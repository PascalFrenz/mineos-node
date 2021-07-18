import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadAveragesComponent } from './load-averages.component';

describe('LoadAveragesComponent', () => {
  let component: LoadAveragesComponent;
  let fixture: ComponentFixture<LoadAveragesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LoadAveragesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoadAveragesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
