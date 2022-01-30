import {Component, Input} from '@angular/core';
import {IconProp} from "@fortawesome/fontawesome-svg-core";

@Component({
  selector: 'app-mini-card',
  template: `
    <div class="shadow-md px-6 py-4 bg-white rounded-md grid grid-cols-2">
      <div class="flex flex-col justify-between">
        <h1 class="text-4xl font-bold">{{value}}</h1>
        <span>{{text}}</span>
      </div>
      <div class="flex justify-end items-center">
        <fa-icon [icon]="icon" size="4x" [ngClass]="{'text-green-700': color === 'green', 'text-white': color === 'white', 'text-black': color === 'black' || color === undefined}"></fa-icon>
      </div>
    </div>
  `,
  styles: [
  ]
})
export class MiniCardComponent {
  @Input() icon!: IconProp;
  @Input() value!: string | number;
  @Input() text!: string;
  @Input() color: "green" | "black" | "white" | undefined
}
