import { Component, OnDestroy, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: []
})
export class HeaderComponent implements OnInit, OnDestroy {
  userLoggedIn: Observable<boolean>;

  constructor(private authService: AuthenticationService) {
    this.userLoggedIn = this.authService.isAuthenticated();
  }

  ngOnInit(): void {

  }

  ngOnDestroy(): void {

  }

  logout() {
    this.authService.logoutUser().subscribe();
  }
}
