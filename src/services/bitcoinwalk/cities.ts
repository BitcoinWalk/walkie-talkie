import { BITCOINWALK_ORIGIN } from './config';

export type BitcoinWalkCity = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  canonicalUrl: string;
  chat: { scope: 'global' | 'city'; url: string | null };
};

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
        !city.chat || !['global', 'city'].includes(city.chat.scope) ||
        !(city.chat.url === null || typeof city.chat.url === 'string')) {
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
