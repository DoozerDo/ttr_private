import { countWords, sha256 } from './text-metrics';

describe('text-metrics helpers', () => {
  it('counts whitespace-delimited words deterministically', () => {
    expect(countWords('  Lead CX operations and  strategy   ')).toBe(4);
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('generates the expected sha256 hash for stable inputs', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
