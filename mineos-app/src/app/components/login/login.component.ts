import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from "@angular/router";
import { faSignInAlt } from '@fortawesome/free-solid-svg-icons';
import { LoginRequest } from '../../models/login-request';
import { AuthenticationService } from '../../services/authentication.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: []
})
export class LoginComponent implements OnInit {
  faSignInAlt = faSignInAlt;

  public hidePassword: boolean = true;
  public loginForm: FormGroup;

  constructor(
    private router: Router,
    private authService: AuthenticationService,
    private fb: FormBuilder
  ) {
    this.loginForm = this.fb.group({
      username: [ '', Validators.required ],
      password: [ '', Validators.required ]
    });
  }

  ngOnInit(): void {}

  login(): void {
    const loginRequest: LoginRequest = {
      username: this.loginForm.controls.username.value,
      password: this.loginForm.controls.password.value
    };

    this.authService.loginUser(loginRequest).subscribe({
      next: loginSuccess => {
        if (loginSuccess) {
          this.router.navigate([ 'dashboard' ]);
        }
      }
    });
  }
}
