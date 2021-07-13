import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { MiniCardComponent } from './mini-card.component';

describe('MiniCardComponent', () => {
  let component: MiniCardComponent;
  let fixture: ComponentFixture<MiniCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MiniCardComponent],
      imports:[MatIconModule, MatCardModule]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MiniCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should return lenth of zero for empty data', () => {
    fixture.detectChanges();
    expect(component.dataLength).toEqual(0);
  });

  it('should return lenth data', () => {
    let testString = 'Houston, we have a problem.'
    component.cardData = { title: 'Test Card', value: testString, iconColor: '', icon: '' };
    fixture.detectChanges();
    expect(component.dataLength).toEqual(27);
  });
});
