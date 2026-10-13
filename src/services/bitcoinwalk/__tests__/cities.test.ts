import { loadCities, parseCityDirectory } from '../cities';
import { BITCOINWALK_ORIGIN } from '../config';

const madeira = {
  id: 'city-id',
  name: 'Madeira',
  slug: 'madeira',
  aliases: [],
  canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
  chat: { scope: 'global', url: 'https://armada.buzz/s/chat.bitcoinwalk.org/group' },
};

describe('BitcoinWalk city directory', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts a versioned canonical city record', () => {
    expect(parseCityDirectory({ version: 1, cities: [madeira] })).toEqual([madeira]);
    expect(parseCityDirectory({ version: 1, cities: [{
      ...madeira,
      chat: { scope: 'global', url: 'https://bitcoinwalk.org/join' },
    }] })).toHaveLength(1);
  });

  it.each([
    { ...madeira, canonicalUrl: 'https://evil.example/madeira' },
    { ...madeira, canonicalUrl: 'https://bitcoinwalk.org/london' },
    { ...madeira, chat: { scope: 'global', url: 'https://evil.example/s/group' } },
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
