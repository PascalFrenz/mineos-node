import { Component, OnInit } from '@angular/core';
import { ThemeSwitcherService } from '../../services/theme-switcher.service';

@Component({
  selector: 'app-theme-switcher',
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.scss']
})
export class ThemeSwitcherComponent implements OnInit {
  isDarkMode:boolean = false;

  constructor(private themeSwitcher:ThemeSwitcherService) { }

  ngOnInit(): void {
    this.isDarkMode=this.themeSwitcher.isDarkMode();
  }

  public changeMode():void{
    this.isDarkMode = !this.isDarkMode;
    this.themeSwitcher.setMode(this.isDarkMode);
  }

}
