import { Component } from '@angular/core';
import { ThemeSwitcherService } from './services/theme-switcher.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'mineos-app';

  constructor(private themeSwitcher:ThemeSwitcherService){
    themeSwitcher.setMode(themeSwitcher.isDarkMode());
  }
}
