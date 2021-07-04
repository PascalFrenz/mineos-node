import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LoginRequest } from '../models/login-request';
import { User } from '../models/user';

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private currentUser: User | undefined = undefined;

  constructor(private http: HttpClient, private router: Router) {}

  isAuthenticated(): Boolean {
    console.log(`current user '${JSON.stringify(this.currentUser)}'`);
    if (this.currentUser) {
      return true;
    }
    return false;
  }

  loginUser(loginRequest: LoginRequest): Observable<boolean> {
    // using FormData does not work due to backend expecting x-www-form-urlencoded not multipart/form-data
    const formData = new HttpParams()
      .set('username', loginRequest.username)
      .set('password', loginRequest.password);
    return this.http.post<User>(`/api/auth`, formData).pipe(
      map((user) => {
        this.currentUser = user;
        this.router.navigate(['/ui/dashboard']);
        return true;
      })
    );
  }

  logoutUser(): Observable<boolean> {
    return this.http.get<User>(`/api/logout`).pipe(
      map((user) => {
        this.currentUser = undefined;
        this.router.navigate(['/ui/login']);
        return true;
      })
    );
  }
}
