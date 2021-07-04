import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LoginComponent } from './components/login/login.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'ui/dashboard' },
  { path: 'ui', pathMatch: 'full', redirectTo: 'ui/dashboard' },
  { path: 'ui/login', component: LoginComponent },
  {
    path: 'ui/dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
