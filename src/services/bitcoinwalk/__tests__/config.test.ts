import { bitcoinWalkOrigin } from '../config';

describe('BitcoinWalk service origin', () => {
  it('defaults to production when no origin is configured', () => {
    expect(bitcoinWalkOrigin('')).toBe('https://bitcoinwalk.org');
  });

  it('allows the production and staging services', () => {
    expect(bitcoinWalkOrigin('https://bitcoinwalk.org')).toBe('https://bitcoinwalk.org');
    expect(bitcoinWalkOrigin('https://app-staging.bitcoinwalk.org'))
      .toBe('https://app-staging.bitcoinwalk.org');
  });

  it('fails closed for arbitrary or malformed origins', () => {
    expect(() => bitcoinWalkOrigin('https://evil.example')).toThrow('Invalid');
    expect(() => bitcoinWalkOrigin('http://127.0.0.1:3000')).toThrow('Invalid');
  });
});
