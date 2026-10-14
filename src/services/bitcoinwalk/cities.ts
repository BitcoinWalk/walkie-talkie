import { BITCOINWALK_ORIGIN } from './config';
import type { BitcoinWalkCommunityDestination } from './community';

export type BitcoinWalkCity = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  canonicalUrl: string;
  avatarUrl: string;
  chat: {
    scope: 'global' | 'city';
    url: string | null;
    nip29: BitcoinWalkCommunityDestination | null;
    communities: {
      global: BitcoinWalkCommunityDestination | null;
      city: BitcoinWalkCommunityDestination | null;
    };
  };
};

export type BitcoinWalkCommunityChoice = {
  scope: 'city' | 'global';
  destination: BitcoinWalkCommunityDestination;
};

function validNip29Destination(
  value: BitcoinWalkCommunityDestination | null,
  _role: 'global' | 'city',
  _slug: string,
): boolean {
  if (value === null) return true;
  if (!value || typeof value.relay !== 'string' ||
      typeof value.groupId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.groupId)) return false;
  try {
    const relay = new URL(value.relay);
    if (relay.protocol !== 'wss:' || relay.username || relay.password || relay.port ||
        relay.pathname !== '/' || relay.search || relay.hash) return false;
    return relay.hostname === 'chat.bitcoinwalk.org' ||
      relay.hostname === 'chat-staging.bitcoinwalk.org';
  } catch {
    return false;
  }
}

export function isWalkieTalkieDestination(
  value: BitcoinWalkCommunityDestination | null | undefined,
): value is BitcoinWalkCommunityDestination {
  return validNip29Destination(value ?? null, 'city', 'unused');
}

function validAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === BITCOINWALK_ORIGIN && !url.username && !url.password && !url.search &&
      !url.hash && (/^\/api\/og\/files\/[0-9a-f]{64}\.jpg$/.test(url.pathname) ||
        url.pathname === '/brand/bitcoinwalk-share-fallback.jpg');
  } catch {
    return false;
  }
}

function sameDestination(
  left: BitcoinWalkCommunityDestination | null,
  right: BitcoinWalkCommunityDestination | null,
): boolean {
  return !!left && !!right && left.relay === right.relay && left.groupId === right.groupId;
}

export function communityChoicesForCity(city: BitcoinWalkCity): BitcoinWalkCommunityChoice[] {
  const choices: BitcoinWalkCommunityChoice[] = [];
  if (city.chat.communities.city) {
    choices.push({ scope: 'city', destination: city.chat.communities.city });
  }
  if (city.chat.communities.global &&
      !sameDestination(city.chat.communities.city, city.chat.communities.global)) {
    choices.push({ scope: 'global', destination: city.chat.communities.global });
  }
  return choices;
}

export function parseCityDirectory(value: unknown): BitcoinWalkCity[] {
  const feed = value as { version?: number; cities?: unknown[] } | null;
  if (feed?.version !== 1 || !Array.isArray(feed.cities) || feed.cities.length > 2000) {
    throw new Error('Invalid city directory');
  }
  const cities = new Map<string, BitcoinWalkCity>();
  for (const entry of feed.cities) {
    const city = entry as BitcoinWalkCity | null;
    if (!city || typeof city.id !== 'string' || !city.id || city.id.length > 120 ||
        typeof city.name !== 'string' || !city.name || city.name.length > 120 ||
        typeof city.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug) ||
        !Array.isArray(city.aliases) || city.aliases.length > 30 ||
        !city.aliases.every((alias) => typeof alias === 'string' && alias.length <= 120) ||
        !validAvatarUrl(city.avatarUrl) ||
        !city.chat || !['global', 'city'].includes(city.chat.scope) ||
        !city.chat.communities ||
        !(city.chat.url === null || typeof city.chat.url === 'string') ||
        !validNip29Destination(city.chat.nip29, city.chat.scope, city.slug) ||
        !validNip29Destination(city.chat.communities.global, 'global', city.slug) ||
        !validNip29Destination(city.chat.communities.city, 'city', city.slug) ||
        sameDestination(city.chat.communities.city, city.chat.communities.global)) {
      throw new Error('Invalid city');
    }
    const canonical = new URL(city.canonicalUrl);
    if (canonical.origin !== BITCOINWALK_ORIGIN || canonical.username || canonical.password ||
        canonical.search || canonical.hash || canonical.pathname !== `/${encodeURIComponent(city.slug)}`) {
      throw new Error('Invalid city link');
    }
    if (city.chat.url !== null) {
      const chat = new URL(city.chat.url);
      const armada = chat.origin === 'https://armada.buzz' && /^\/s\/[^/]+\/[^/]+$/.test(chat.pathname);
      const bitcoinWalkJoin = ['https://bitcoinwalk.org', 'https://app-staging.bitcoinwalk.org']
        .includes(chat.origin) && chat.pathname === '/join';
      if ((!armada && !bitcoinWalkJoin) || chat.username || chat.password || chat.search || chat.hash) {
        throw new Error('Invalid city chat link');
      }
    }
    if (cities.has(city.id)) throw new Error('Duplicate city');
    cities.set(city.id, city);
  }
  return [...cities.values()];
}

export async function loadCities(signal: AbortSignal): Promise<BitcoinWalkCity[]> {
  const response = await fetch(`${BITCOINWALK_ORIGIN}/api/cities`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('City directory unavailable');
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('City directory too large');
  return parseCityDirectory(JSON.parse(body));
}
