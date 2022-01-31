import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { concatMap, map, retry, take } from 'rxjs/operators';
import { LoginRequest } from '../models/login-request';
import { User } from '../models/user';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  constructor(private http: HttpClient) {}

  isAuthenticated(): Observable<boolean> {
    return this.http
      .get<{ authenticated: boolean }>('/api/auth/is-authenticated')
      .pipe(
        map((result: { authenticated: boolean }) => {
          return result.authenticated;
        })
      );
  }

  loginUser(loginRequest: LoginRequest): Observable<boolean> {
    // using FormData does not work due to backend expecting x-www-form-urlencoded not multipart/form-data
    const formData = new HttpParams()
      .set('username', loginRequest.username)
      .set('password', loginRequest.password);
    return this.http.post<User>(`/api/auth`, formData).pipe(
      concatMap(() => this.isAuthenticated()),
      retry(3)
    );
  }

  logoutUser(): Observable<boolean> {
    return this.http.get<User>(`/api/logout`).pipe(
      take(1),
      map(() => true),
      retry(3)
    );
  }
}
