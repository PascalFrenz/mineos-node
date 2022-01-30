import { Component } from '@angular/core';

@Component({
  selector: 'app-card',
  template: `
      <div class="shadow-md px-6 py-4 bg-white rounded-md">
          <ng-content></ng-content>
      </div>
  `
})
export class CardComponent {}
