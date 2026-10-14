import {
  communityChoicesForCity,
  loadCities,
  parseCityDirectory,
  type BitcoinWalkCity,
} from '../cities';
import { BITCOINWALK_ORIGIN } from '../config';

const madeira: BitcoinWalkCity = {
  id: 'city-id',
  name: 'Madeira',
  slug: 'madeira',
  aliases: [],
  canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
  avatarUrl: `${BITCOINWALK_ORIGIN}/api/og/files/${'a'.repeat(64)}.jpg`,
  chat: {
    scope: 'global',
    url: 'https://armada.buzz/s/chat.bitcoinwalk.org/group',
    nip29: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'group' },
    communities: {
      global: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'global' },
      city: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'madeira' },
    },
  },
};

describe('BitcoinWalk city directory', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts a versioned canonical city record', () => {
    expect(parseCityDirectory({ version: 1, cities: [madeira] })).toEqual([madeira]);
    expect(parseCityDirectory({ version: 1, cities: [{
      ...madeira,
      chat: {
        scope: 'global',
        url: 'https://bitcoinwalk.org/join',
        nip29: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'group' },
        communities: madeira.chat.communities,
      },
    }] })).toHaveLength(1);
  });

  it.each([
    { ...madeira, canonicalUrl: 'https://evil.example/madeira' },
    { ...madeira, canonicalUrl: 'https://bitcoinwalk.org/london' },
    { ...madeira, avatarUrl: 'https://evil.example/avatar.jpg' },
    { ...madeira, chat: { scope: 'global', url: 'https://evil.example/s/group' } },
    { ...madeira, chat: { ...madeira.chat, nip29: { relay: 'wss://evil.example', groupId: 'group' } } },
    { ...madeira, chat: { ...madeira.chat, nip29: { relay: 'wss://chat.bitcoinwalk.org', groupId: '../group' } } },
    { ...madeira, chat: { ...madeira.chat, scope: 'city', url: null,
      nip29: { relay: 'wss://london.bitcoinwalk.org', groupId: 'group' } } },
    { ...madeira, chat: { ...madeira.chat, communities: {
      global: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'same' },
      city: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'same' },
    } } },
    { ...madeira, slug: '../madeira' },
  ])('rejects an unsafe city record', (city) => {
    expect(() => parseCityDirectory({ version: 1, cities: [city] })).toThrow('Invalid');
  });

  it('orders the selected city group before BitcoinWalk Global', () => {
    expect(communityChoicesForCity(madeira).map((choice) => choice.scope)).toEqual(['city', 'global']);
  });

  it('passes cancellation to the public endpoint', async () => {
    const controller = new AbortController();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ version: 1, cities: [madeira] }),
    } as Response);
    await expect(loadCities(controller.signal)).resolves.toEqual([madeira]);
    expect(fetch).toHaveBeenCalledWith(`${BITCOINWALK_ORIGIN}/api/cities`,
      expect.objectContaining({ signal: controller.signal }));
  });
});
