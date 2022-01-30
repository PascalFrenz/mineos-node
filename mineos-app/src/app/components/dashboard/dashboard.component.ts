import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CardLayout } from '../../models/card-layout';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [],
})
export class DashboardComponent {
  /** Based on the screen size, switch from standard to two column per row */
  cardLayout$:Observable<CardLayout>;

  constructor(private breakpointObserver: BreakpointObserver) {
    this.cardLayout$ = this.breakpointObserver
   .observe([Breakpoints.Medium, Breakpoints.Small, Breakpoints.XSmall])
   .pipe(
     map(({ matches }) => {
       if (matches) {
         return {
           columns: 2,
           smallCard: { cols: 1, rows: 1 },
           largeCard: { cols: 2, rows: 2 },
         };
       }

       return {
         columns: 4,
         smallCard: { cols: 1, rows: 1 },
         largeCard: { cols: 4, rows: 2 },
       };
     })
   );
  }
}
