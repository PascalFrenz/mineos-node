import { Component, OnInit } from '@angular/core';
import { Observable } from "rxjs";
import { take } from "rxjs/operators";
import { AuthenticationService } from "./services/authentication.service";

@Component({
  selector: 'app-root',
  template: `
    <ng-container *ngIf="userLoggedIn | async">
      <app-header (logout)="logout()"></app-header>
    </ng-container>
    <!-- main app container -->
    <div>
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: []
})
export class AppComponent implements OnInit {
  userLoggedIn!: Observable<boolean>;

  constructor(private authService: AuthenticationService) {}

  ngOnInit(): void {
    this.userLoggedIn = this.authService.isAuthenticated();
  }

  logout(): void {
    this.authService.logoutUser().pipe(take(1)).subscribe();
  }
}
