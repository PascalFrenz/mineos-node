import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service';
import { ThemeSwitcherService } from '../../services/theme-switcher.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: [],
})
export class HeaderComponent {
  darkMode:Observable<boolean>;
  userLoggedIn:Observable<boolean>;
  constructor(private authService: AuthenticationService, private themeSwitcher:ThemeSwitcherService) {
    this.userLoggedIn = this.authService.isAuthenticated();
    this.darkMode = this.themeSwitcher.isDarkMode();
  }

  logout() {
    this.authService.logoutUser().subscribe();
  }

  public changeMode(isDark:boolean):void{
    this.themeSwitcher.setMode(isDark);
  }
}
