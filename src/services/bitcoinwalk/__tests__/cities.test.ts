import { loadCities, parseCityDirectory } from '../cities';
import { BITCOINWALK_ORIGIN } from '../config';

const madeira = {
  id: 'city-id',
  name: 'Madeira',
  slug: 'madeira',
  aliases: [],
  canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
  chat: {
    scope: 'global',
    url: 'https://armada.buzz/s/chat.bitcoinwalk.org/group',
    nip29: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'group' },
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
      },
    }] })).toHaveLength(1);
  });

  it.each([
    { ...madeira, canonicalUrl: 'https://evil.example/madeira' },
    { ...madeira, canonicalUrl: 'https://bitcoinwalk.org/london' },
    { ...madeira, chat: { scope: 'global', url: 'https://evil.example/s/group' } },
    { ...madeira, chat: { ...madeira.chat, nip29: { relay: 'wss://evil.example', groupId: 'group' } } },
    { ...madeira, chat: { ...madeira.chat, nip29: { relay: 'wss://chat.bitcoinwalk.org', groupId: '../group' } } },
    { ...madeira, chat: { scope: 'city', url: null, nip29: { relay: 'wss://london.bitcoinwalk.org', groupId: 'group' } } },
    { ...madeira, slug: '../madeira' },
  ])('rejects an unsafe city record', (city) => {
    expect(() => parseCityDirectory({ version: 1, cities: [city] })).toThrow('Invalid');
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
