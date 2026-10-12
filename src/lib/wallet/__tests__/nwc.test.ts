import { parseNwcConnectionString } from '../nwc';

it('returns normalized and deduplicated NWC relays', () => {
  const params = new URLSearchParams({ secret: '22'.repeat(32) });
  params.append('relay', 'https://RELAY.example//?z=2&a=1#fragment');
  params.append('relay', 'wss://relay.example/?a=1&z=2');
  const parsed = parseNwcConnectionString(`nostr+walletconnect://${'11'.repeat(32)}?${params}`);
  expect(parsed.relays).toEqual(['wss://relay.example/?a=1&z=2']);
});
