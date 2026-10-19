import { appCityPageUrl, communityScopeForCityPageUrl } from '../city-page-links';
import type { BitcoinWalkCity } from '../cities';

const city = {
  id: 'city', name: 'Madeira', slug: 'madeira', aliases: [],
  canonicalUrl: 'https://bitcoinwalk.org/madeira',
  avatarUrl: 'https://bitcoinwalk.org/brand/bitcoinwalk-share-fallback.jpg',
  chat: {
    scope: 'city',
    url: 'https://armada.buzz/s/chat.bitcoinwalk.org/bitcoinwalk-madeira',
    nip29: null,
    communities: {
      city: { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'bitcoinwalk-madeira' },
      global: { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'global' },
    },
  },
} satisfies BitcoinWalkCity;

describe('BitcoinWalk city-page link routing', () => {
  it('requests the compact app presentation without changing the city path', () => {
    expect(appCityPageUrl(city.canonicalUrl)).toBe('https://bitcoinwalk.org/madeira?view=app');
  });

  it('opens the exact city and global destinations in native chat', () => {
    expect(communityScopeForCityPageUrl(city, city.chat.url!)).toBe('city');
    expect(communityScopeForCityPageUrl(city,
      'https://armada.buzz/s/chat.bitcoinwalk.org/global')).toBe('global');
  });

  it('does not capture unrelated links', () => {
    expect(communityScopeForCityPageUrl(city, 'https://example.com/')).toBeNull();
  });
});
