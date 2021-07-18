import { BytesToMegabytesPipe } from './bytes-to-megabytes.pipe';

describe('BytesToMegabytesPipe', () => {
  it('create an instance', () => {
    const pipe = new BytesToMegabytesPipe();
    expect(pipe).toBeTruthy();
  });
});
