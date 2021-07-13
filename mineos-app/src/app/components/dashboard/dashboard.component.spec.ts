import {
  BreakpointObserver,
  Breakpoints,
  BreakpointState,
  LayoutModule,
} from '@angular/cdk/layout';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  waitForAsync,
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { DashboardComponent } from './dashboard.component';
import { from, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { CardLayout } from 'src/app/models/card-layout';
import { MockComponent } from 'ng-mocks';
import { MiniCardComponent } from '../mini-card/mini-card.component';
import { ActiveServerListComponent } from '../active-server-list/active-server-list.component';
import { CreateServerListComponent } from '../create-server-list/create-server-list.component';
import { DashboardCardComponent } from '../dashboard-card/dashboard-card.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockBreakpointObserver: jasmine.SpyObj<BreakpointObserver>;
  const matchObj = [
    // initially all are false
    { matchStr: Breakpoints.XSmall, result: false },
    { matchStr: Breakpoints.Small, result: false },
    { matchStr: Breakpoints.Medium, result: false },
  ];
  const fakeObserve = (s: string[]): Observable<BreakpointState> =>
    from(matchObj).pipe(
      filter((match) => match.matchStr === s[0]),
      map((match) => ({ matches: match.result, breakpoints: {} }))
    );
  function resize(width: number): void {
    matchObj[0].result = width >= 1024;
    matchObj[1].result = width >= 1366;
    matchObj[2].result = width <= 1366;
  }
  beforeEach(
    waitForAsync(() => {
      mockBreakpointObserver = jasmine.createSpyObj('BreakpointObserver', [
        'observe',
      ]);
      mockBreakpointObserver.observe.and.callFake(fakeObserve);
      TestBed.configureTestingModule({
        providers: [
          { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        ],
        declarations: [
          DashboardComponent,
          MockComponent(MiniCardComponent),
          MockComponent(DashboardCardComponent),
          MockComponent(CreateServerListComponent),
          MockComponent(ActiveServerListComponent),
        ],
        imports: [
          NoopAnimationsModule,
          LayoutModule,
          MatButtonModule,
          MatCardModule,
          MatGridListModule,
          MatIconModule,
          MatMenuModule,
        ],
      }).compileComponents();
    })
  );

  it('should compile', () => {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should have 4 columns on full screen', fakeAsync(() => {
    let result: CardLayout = new CardLayout();
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.cardLayout$.subscribe((data) => {
      result = data;
    });
    tick();
    expect(result.columns).toEqual(4);
  }));

  it('should have 2 columns on small screen', fakeAsync(() => {
    let result: CardLayout = new CardLayout();
    resize(600);
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.cardLayout$.subscribe((data) => {
      result = data;
    });
    tick();
    expect(result?.columns).toEqual(2);
  }));

  it('should have 4 mini cards', () => {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.miniCardData.map((d) => d.title)).toEqual([
      'Servers Running',
      'Players Online',
      'Uptime',
      'RAM Free',
    ]);
  });
});
