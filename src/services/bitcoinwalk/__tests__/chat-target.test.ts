import fixture from '../fixtures/chat-targets-v1.json';
import {
  bitcoinWalkMobileHref,
  loadBitcoinWalkChatTarget,
  parseBitcoinWalkChatPath,
  parseBitcoinWalkChatTargetResolution,
  resolveBitcoinWalkChatIntent,
} from '../chat-target';
import type { BitcoinWalkCity } from '../cities';
import { BITCOINWALK_ORIGIN } from '../config';

const destination = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'madeira' };
const city: BitcoinWalkCity = {
  id: 'city-madeira',
  name: 'Madeira',
  slug: 'madeira',
  aliases: ['funchal'],
  canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
  avatarUrl: `${BITCOINWALK_ORIGIN}/brand/bitcoinwalk-share-fallback.jpg`,
  chat: {
    scope: 'city',
    url: null,
    nip29: destination,
    communities: { city: destination, global: null },
  },
};
const cities = [city];
const guidePubkey = 'a'.repeat(64);

function responseFor(kind: 'city' | 'guide' | 'global' | 'hosts') {
  const target = kind === 'city'
    ? { version: 1 as const, kind, cityId: city.id }
    : { version: 1 as const, kind };
  return {
    version: 1,
    state: 'resolved',
    target,
    canonicalPath: kind === 'city' ? '/chat/madeira' : `/chat/${kind}`,
    webPath: kind === 'city' ? '/admin/chat?city=madeira' : `/admin/chat?room=${kind}`,
    access: kind === 'guide' ? 'account-inbox' : kind === 'hosts'
      ? 'signed-host-roster' : 'public-membership',
    transport: kind === 'guide' ? { protocol: 'nip17', pubkey: guidePubkey }
      : kind === 'hosts' ? null : { protocol: 'nip29', destination },
  };
}

describe('BitcoinWalk canonical chat targets', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(fixture.cases)('executes the shared $path fixture', ({ path, intent, target }) => {
    expect(parseBitcoinWalkChatPath(path)).toEqual(intent);
    expect(resolveBitcoinWalkChatIntent(path, cities)?.target).toEqual(target);
  });

  it.each(fixture.legacyCases)('canonicalizes the shared legacy path $path', ({ path, intent, canonicalPath }) => {
    expect(parseBitcoinWalkChatPath(path)).toEqual(intent);
    expect(resolveBitcoinWalkChatIntent(path, cities)?.canonicalPath).toBe(canonicalPath);
  });

  it.each(fixture.invalidPaths)('rejects the shared invalid path %s', (path) => {
    expect(parseBitcoinWalkChatPath(path)).toBeNull();
  });

  it('maps a unique approved alias to the immutable city id', () => {
    expect(resolveBitcoinWalkChatIntent('/chat/funchal', cities)).toEqual({
      intent: { kind: 'city', city: 'funchal' },
      target: { version: 1, kind: 'city', cityId: city.id },
      canonicalPath: '/chat/madeira',
    });
  });

  it.each([
    ['city', '/community?scope=city&city=madeira'],
    ['guide', `/chat/${guidePubkey}?mode=guide`],
    ['global', '/community?scope=global'],
    ['hosts', '/community?scope=hosts'],
  ] as const)('validates and routes the %s response', (kind, href) => {
    const resolution = parseBitcoinWalkChatTargetResolution(responseFor(kind), cities);
    expect(bitcoinWalkMobileHref(resolution)).toBe(href);
  });

  it('refuses anonymous Hosts coordinates', () => {
    expect(() => parseBitcoinWalkChatTargetResolution({
      ...responseFor('hosts'),
      transport: { protocol: 'nip29', destination },
    }, cities)).toThrow('Hosts');
  });

  it('refuses a city target that is not in the approved directory', () => {
    expect(() => parseBitcoinWalkChatTargetResolution({
      ...responseFor('city'),
      target: { version: 1, kind: 'city', cityId: 'city-unknown' },
    }, cities)).toThrow('Invalid');
  });

  it('loads the read-only resolver without converting failures into success', async () => {
    const controller = new AbortController();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(responseFor('global')),
    } as Response);
    await expect(loadBitcoinWalkChatTarget('/chat/global', cities, controller.signal))
      .resolves.toEqual(responseFor('global'));
    expect(fetch).toHaveBeenCalledWith(
      `${BITCOINWALK_ORIGIN}/api/chat/destination?path=%2Fchat%2Fglobal`,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
