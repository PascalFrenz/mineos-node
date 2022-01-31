import { Component } from '@angular/core';
import { Router } from "@angular/router";
import { concatMap } from "rxjs/operators";
import { AuthenticationService } from "../../services/authentication.service";

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: []
})
export class HeaderComponent {

  constructor(
    private authService: AuthenticationService,
    private router: Router
  ) {}

  logout(): void {
    this.authService.logoutUser()
      .pipe(concatMap(() => this.authService.isAuthenticated())).subscribe({
      next: () => this.router.navigate([ 'login' ])
    });
  }
}
