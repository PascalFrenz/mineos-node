import { Component } from '@angular/core';

@Component({
  template: `
    <app-header></app-header>
    <router-outlet></router-outlet>
  `,
})
export class AuthenticatedPageComponent {
}
