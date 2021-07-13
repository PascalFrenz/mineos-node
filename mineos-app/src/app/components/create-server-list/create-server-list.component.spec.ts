import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateServerListComponent } from './create-server-list.component';

describe('CreateServerListComponent', () => {
  let component: CreateServerListComponent;
  let fixture: ComponentFixture<CreateServerListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CreateServerListComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateServerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
