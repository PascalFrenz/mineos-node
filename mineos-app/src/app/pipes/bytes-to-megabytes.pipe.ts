import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'bytes_to_mb',
})
export class BytesToMegabytesPipe implements PipeTransform {
  transform(value: number | null, ...args: unknown[]): string | null {
    if (value === null || value === undefined) return null;
    else {
      console.log(`converting value => ${value}`)
      let bytes: number = value;
      if (bytes == 0) return '0B';
      else if (bytes < 1024) return bytes + 'B';

      var k = 1024;
      var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));

      return (bytes / Math.pow(k, i)).toPrecision(3) + sizes[i];
    }
  }
}
