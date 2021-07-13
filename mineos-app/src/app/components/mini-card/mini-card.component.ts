import { Component, Input, OnInit } from '@angular/core';
import { MiniCardData } from 'src/app/models/mini-card-data';

@Component({
  selector: 'app-mini-card',
  templateUrl: './mini-card.component.html',
  styleUrls: ['./mini-card.component.scss'],
})
export class MiniCardComponent implements OnInit {
  public dataLength: number = 0;

  @Input() public cardData: MiniCardData = new MiniCardData();

  constructor() {}
  ngOnInit(): void {
    if (this.cardData?.value) {
      this.dataLength = this.cardData.value.length;
    }
  }
}
