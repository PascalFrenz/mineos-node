import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { ArchiveComponent } from './components/archive/archive.component';
import { AuthenticatedPageComponent } from "./components/authenticated-page/authenticated-page.component";
import { CalendarComponent } from './components/calendar/calendar.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { EnvironmentComponent } from './components/environment/environment.component';
import { LoggingComponent } from './components/logging/logging.component';
import { LoginComponent } from './components/login/login.component';
import { ProfilesComponent } from './components/profiles/profiles.component';
import { RestorePointComponent } from './components/restore-point/restore-point.component';
import { SchedulingComponent } from './components/scheduling/scheduling.component';
import { ServerDetailsComponent } from './components/server-details/server-details.component';
import { StatusComponent } from './components/status/status.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: '',
    component: AuthenticatedPageComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        component: DashboardComponent,
      },
      {
        path: 'profiles',
        component: ProfilesComponent,
      },
      {
        path: 'server-details',
        component: ServerDetailsComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'status' },
          { path: 'status', component: StatusComponent },
          { path: 'environment', component: EnvironmentComponent },
          { path: 'restore-point', component: RestorePointComponent },
          { path: 'archive', component: ArchiveComponent },
          { path: 'schedule', component: SchedulingComponent },
          { path: 'logging', component: LoggingComponent },
        ],
      },
      {
        path: 'calendar',
        component: CalendarComponent,
        canActivate: [AuthGuard],
      }
    ]
  },
  { path: 'login', component: LoginComponent },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
