import { loadWalks, parseWalkFeed } from '../walks';
import { BITCOINWALK_ORIGIN } from '../config';

const walk = {
  id: 'a'.repeat(64), name: 'BitcoinWalk Madeira', description: 'Meet for a walk',
  startDate: '2030-01-01T10:00:00Z', endDate: '2030-01-01T12:00:00Z',
  timeZone: 'Atlantic/Madeira', link: `${BITCOINWALK_ORIGIN}/madeira/nevent1abc`,
  address: 'Meeting point', latitude: 32.6, longitude: -16.9,
};
const feed = (events: unknown[]) => ({ version: 1, events });

test('retains upcoming walks, removes expired entries and deduplicates', () => {
  expect(parseWalkFeed(feed([walk, walk]), Date.parse('2029-01-01'))).toEqual([walk]);
  expect(parseWalkFeed(feed([walk]), Date.parse('2031-01-01'))).toEqual([]);
});

test.each([
  { link: 'https://evil.example/madeira/nevent1abc' },
  { link: 'https://user:password@bitcoinwalk.org/madeira/nevent1abc' },
  { latitude: 91 }, { longitude: NaN }, { startDate: 'invalid' },
  { endDate: '2020-01-01' }, { timeZone: 'Not/AZone' }, { name: '' },
])('rejects invalid fields instead of showing unsafe or misleading data: %p', (changes) => {
  expect(() => parseWalkFeed(feed([{ ...walk, ...changes }]))).toThrow();
});

test('distinguishes an empty valid response from an unavailable or invalid feed', () => {
  expect(parseWalkFeed(feed([]))).toEqual([]);
  expect(() => parseWalkFeed({ version: 2, events: [] })).toThrow();
  expect(() => parseWalkFeed(null)).toThrow();
});

test('passes cancellation to transport and rejects unsuccessful HTTP responses', async () => {
  const original = global.fetch;
  const mock = jest.fn().mockResolvedValue({ ok: false });
  global.fetch = mock;
  try {
    const controller = new AbortController();
    await expect(loadWalks(controller.signal)).rejects.toThrow('unavailable');
    expect(mock).toHaveBeenCalledWith(`${BITCOINWALK_ORIGIN}/api/events`,
      expect.objectContaining({ signal: controller.signal }));
  } finally { global.fetch = original; }
});
