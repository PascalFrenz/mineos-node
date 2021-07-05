import { Injectable } from '@angular/core';
import { UserPreferences } from '../models/user-preferences';
import { UserPreferencesService } from './user-preferences.service';

@Injectable({
  providedIn: 'root',
})
export class ThemeSwitcherService {
  constructor(private userPreferencesService:UserPreferencesService) {}
  isDarkMode(): boolean {
    let preferences:UserPreferences = this.userPreferencesService.getUserPreferences();
    return preferences.darkMode;
  }

  setMode(dark: boolean): void {
    let preferences:UserPreferences = this.userPreferencesService.getUserPreferences();
    preferences.darkMode = dark;
    this.userPreferencesService.saveUserPreferences(preferences);
    if (dark === true) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }
}
