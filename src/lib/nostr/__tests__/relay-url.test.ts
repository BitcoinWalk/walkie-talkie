import {
  BITCOINWALK_DM_RELAY,
  DEFAULT_DM_RELAYS,
  migrateLegacyDmRelayUrls,
  normalizeRelayUrl,
  normalizeRelayUrls,
} from '../relay-url';

describe('relay URL normalization', () => {
  it.each([
    ['wss://relay.example', 'wss://relay.example/'],
    ['wss://relay.example/', 'wss://relay.example/'],
    ['Relay.Example', 'wss://relay.example/'],
    ['https://Relay.Example:443/', 'wss://relay.example/'],
    ['http://Relay.Example:80/', 'ws://relay.example/'],
    ['WSS://Relay.Example:443/', 'wss://relay.example/'],
    ['localhost:8080', 'ws://localhost:8080/'],
    ['localhost/path', 'ws://localhost/path'],
    ['127.0.0.1:8080', 'ws://127.0.0.1:8080/'],
    ['192.168.1.2:8080', 'ws://192.168.1.2:8080/'],
    ['wss://relay.example:8443//a///b/#fragment', 'wss://relay.example:8443/a/b'],
    ['wss://relay.example//?z=2&a=1#fragment', 'wss://relay.example/?a=1&z=2'],
    ['wss://relay.example/path/?b=2&a=hello%20world', 'wss://relay.example/path?a=hello+world&b=2'],
    ['wss://relay.example/path?token=a/b/', 'wss://relay.example/path?token=a%2Fb%2F'],
    ['wss://relay.example/?token=a/b/', 'wss://relay.example/?token=a%2Fb%2F'],
    ['  wss://relay.example/  ', 'wss://relay.example/'],
  ])('normalizes %s to %s and is idempotent', (input, expected) => {
    expect(normalizeRelayUrl(input)).toBe(expected);
    expect(normalizeRelayUrl(expected)).toBe(expected);
  });

  it.each(['', ' ', 'wss://', 'ftp://relay.example', 'javascript:alert(1)', 'not a relay']) (
    'rejects invalid relay input %s', (input) => {
      expect(() => normalizeRelayUrl(input)).toThrow();
    },
  );

  it('deduplicates equivalent hints while skipping malformed entries', () => {
    expect(normalizeRelayUrls([
      'https://RELAY.example//?b=2&a=1#one',
      'wss://relay.example/?a=1&b=2', 'wss://', 'relay.example',
    ])).toEqual(['wss://relay.example/?a=1&b=2', 'wss://relay.example/']);
  });

  it('uses the BitcoinWalk inbox for new accounts', () => {
    expect(DEFAULT_DM_RELAYS[0]).toBe(BITCOINWALK_DM_RELAY);
    expect(DEFAULT_DM_RELAYS).not.toContain('wss://relay.psstpsst.chat/');
  });

  it('replaces only the legacy managed inbox and preserves other choices', () => {
    expect(migrateLegacyDmRelayUrls([
      'wss://custom.example/',
      'https://relay.psstpsst.chat',
      'wss://inbox.bitcoinwalk.org',
    ])).toEqual({
      relays: ['wss://custom.example/', 'wss://inbox.bitcoinwalk.org/'],
      changed: true,
    });
  });

  it('leaves an already migrated list unchanged', () => {
    expect(migrateLegacyDmRelayUrls(['wss://inbox.bitcoinwalk.org/', 'wss://custom.example/']))
      .toEqual({
        relays: ['wss://inbox.bitcoinwalk.org/', 'wss://custom.example/'],
        changed: false,
      });
  });
});
