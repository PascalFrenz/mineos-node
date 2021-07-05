import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { AuthenticationService } from '../../services/authentication.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
   private darkTheme: boolean = false;
   @Output() isDarkTheme = new EventEmitter<boolean>();

  constructor(private authService: AuthenticationService) {}

  ngOnInit(): void {}

  logout(): void {
    this.authService.logoutUser().subscribe();
  }

  changeTheme(): void {
    if (this.darkTheme) {
       this.darkTheme = false;
    } else {
       this.darkTheme = true;
    }
    this.isDarkTheme.emit(this.darkTheme);
 }
}
