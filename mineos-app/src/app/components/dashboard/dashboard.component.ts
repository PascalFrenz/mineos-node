import { Component } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  Breakpoints,
  BreakpointObserver,
} from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { CardLayout } from '../../models/card-layout';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  miniCardData = [
    { title: 'Servers Running', value: '2', iconColor: '', icon: 'check_circle' },
    { title: 'Players Online', value: '0', iconColor: '', icon: 'people_outline' },
    { title: 'Uptime', value: '43 days 10 hours 57 minutes', iconColor: '', icon: 'av_timer' },
    { title: 'RAM Free', value: '716MB', iconColor: '', icon: 'show_chart' },
  ];
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
