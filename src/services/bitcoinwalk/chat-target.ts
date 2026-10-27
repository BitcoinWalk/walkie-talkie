import { BITCOINWALK_ORIGIN } from './config';
import { isWalkieTalkieDestination, loadCities, type BitcoinWalkCity } from './cities';
import type { BitcoinWalkCommunityDestination } from './community';

export type BitcoinWalkChatTarget = { version: 1 } & (
  { kind: 'city'; cityId: string } |
  { kind: 'guide' | 'global' | 'hosts' }
);

export type BitcoinWalkChatIntent =
  { kind: 'city'; city: string } |
  { kind: 'guide' | 'global' | 'hosts' };

export type BitcoinWalkChatTargetResolution = {
  version: 1;
  state: 'resolved';
  target: BitcoinWalkChatTarget;
  canonicalPath: string;
  webPath: string;
  access: 'public-membership' | 'account-inbox' | 'signed-host-roster';
  transport:
    { protocol: 'nip29'; destination: BitcoinWalkCommunityDestination } |
    { protocol: 'nip17'; pubkey: string } |
    null;
} | {
  version: 1;
  state: 'invalid' | 'not-found' | 'unavailable';
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const RESERVED_CHAT_SLUGS = new Set(['city', 'guide', 'global', 'hosts']);

export function isReservedBitcoinWalkChatSlug(slug: string): boolean {
  return RESERVED_CHAT_SLUGS.has(slug.toLowerCase());
}

export function parseBitcoinWalkChatPath(path: string): BitcoinWalkChatIntent | null {
  if (path.length > 512 || /[?#\\\s]/.test(path)) return null;
  if (path === '/chat/guide' || path === '/chat/global' || path === '/chat/hosts') {
    return { kind: path.slice(6) as 'guide' | 'global' | 'hosts' };
  }
  const match = /^\/chat\/(?:city\/)?([A-Za-z0-9-]{1,128})$/.exec(path);
  return match && !isReservedBitcoinWalkChatSlug(match[1])
    ? { kind: 'city', city: match[1] }
    : null;
}

function normalizeCitySlug(value: string): string {
  const latin: Record<string, string> = {
    ł: 'l', đ: 'd', ð: 'd', þ: 'th', æ: 'ae', œ: 'oe', ø: 'o', ħ: 'h',
    ı: 'i', ŧ: 't', ŋ: 'n', ə: 'e', ß: 'ss', ƒ: 'f',
  };
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[łđðþæœøħıŧŋəßƒ]/g, (letter) => latin[letter] ?? letter)
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function resolveCity(
  cities: BitcoinWalkCity[],
  requested: string,
): BitcoinWalkCity | null {
  const slug = normalizeCitySlug(requested);
  if (!slug || isReservedBitcoinWalkChatSlug(slug)) return null;
  const canonical = cities.find((city) => city.slug === slug);
  if (canonical) return canonical;
  const aliases = cities.filter((city) => city.aliases.some((alias) => normalizeCitySlug(alias) === slug));
  const unique = [...new Map(aliases.map((city) => [city.id, city])).values()];
  return unique.length === 1 ? unique[0] : null;
}

export function resolveBitcoinWalkChatIntent(
  path: string,
  cities: BitcoinWalkCity[],
): { intent: BitcoinWalkChatIntent; target: BitcoinWalkChatTarget; canonicalPath: string } | null {
  const intent = parseBitcoinWalkChatPath(path);
  if (!intent) return null;
  if (intent.kind !== 'city') {
    return { intent, target: { version: 1, kind: intent.kind }, canonicalPath: `/chat/${intent.kind}` };
  }
  const city = resolveCity(cities, intent.city);
  if (!city) return null;
  return {
    intent,
    target: { version: 1, kind: 'city', cityId: city.id },
    canonicalPath: `/chat/${city.slug}`,
  };
}

function expectedWebPath(target: BitcoinWalkChatTarget, city?: BitcoinWalkCity): string {
  if (target.kind === 'city') return `/admin/chat?city=${encodeURIComponent(city!.slug)}`;
  return `/admin/chat?room=${target.kind}`;
}

export function parseBitcoinWalkChatTargetResolution(
  value: unknown,
  cities: BitcoinWalkCity[],
): BitcoinWalkChatTargetResolution {
  const resolution = value as Partial<BitcoinWalkChatTargetResolution> | null;
  if (resolution?.version !== 1 || typeof resolution.state !== 'string') {
    throw new Error('Invalid BitcoinWalk chat target');
  }
  if (resolution.state === 'invalid' || resolution.state === 'not-found' || resolution.state === 'unavailable') {
    return { version: 1, state: resolution.state };
  }
  if (resolution.state !== 'resolved' || !resolution.target ||
      typeof resolution.canonicalPath !== 'string' || typeof resolution.webPath !== 'string') {
    throw new Error('Invalid BitcoinWalk chat target');
  }
  const target = resolution.target as BitcoinWalkChatTarget;
  const city = target.kind === 'city' && typeof target.cityId === 'string'
    ? cities.find((entry) => entry.id === target.cityId)
    : undefined;
  const validTarget = target.version === 1 && (
    (target.kind === 'city' && !!city) ||
    target.kind === 'guide' || target.kind === 'global' || target.kind === 'hosts'
  );
  const expectedPath = target.kind === 'city' ? `/chat/${city?.slug ?? ''}` : `/chat/${target.kind}`;
  if (!validTarget || resolution.canonicalPath !== expectedPath ||
      resolution.webPath !== expectedWebPath(target, city)) {
    throw new Error('Invalid BitcoinWalk chat target');
  }
  if (target.kind === 'hosts') {
    if (resolution.access !== 'signed-host-roster' || resolution.transport !== null) {
      throw new Error('Invalid BitcoinWalk Hosts target');
    }
  } else if (target.kind === 'guide') {
    const transport = resolution.transport as { protocol?: unknown; pubkey?: unknown } | null;
    if (resolution.access !== 'account-inbox' || transport?.protocol !== 'nip17' ||
        typeof transport.pubkey !== 'string' || !HEX_PUBKEY.test(transport.pubkey)) {
      throw new Error('Invalid BitcoinWalk Guide target');
    }
  } else {
    const transport = resolution.transport as {
      protocol?: unknown;
      destination?: BitcoinWalkCommunityDestination;
    } | null;
    if (resolution.access !== 'public-membership' || transport?.protocol !== 'nip29' ||
        !isWalkieTalkieDestination(transport.destination)) {
      throw new Error('Invalid BitcoinWalk community target');
    }
  }
  return resolution as BitcoinWalkChatTargetResolution;
}

export async function loadBitcoinWalkChatTarget(
  path: string,
  cities: BitcoinWalkCity[],
  signal: AbortSignal,
): Promise<BitcoinWalkChatTargetResolution> {
  if (!parseBitcoinWalkChatPath(path)) throw new Error('Invalid BitcoinWalk chat path');
  const response = await fetch(
    `${BITCOINWALK_ORIGIN}/api/chat/destination?path=${encodeURIComponent(path)}`,
    { signal, headers: { Accept: 'application/json' } },
  );
  const body = await response.text();
  if (body.length > 20_000) throw new Error('BitcoinWalk chat target too large');
  const resolution = parseBitcoinWalkChatTargetResolution(JSON.parse(body), cities);
  if (!response.ok && resolution.state === 'resolved') throw new Error('BitcoinWalk chat target unavailable');
  return resolution;
}

export function bitcoinWalkMobileHref(resolution: BitcoinWalkChatTargetResolution): string | null {
  if (resolution.state !== 'resolved') return null;
  if (resolution.target.kind === 'city') {
    return `/community?scope=city&city=${encodeURIComponent(resolution.canonicalPath.slice(6))}`;
  }
  if (resolution.target.kind === 'global' || resolution.target.kind === 'hosts') {
    return `/community?scope=${resolution.target.kind}`;
  }
  const transport = resolution.transport;
  return transport?.protocol === 'nip17' ? `/chat/${transport.pubkey}?mode=guide` : null;
}

/** Resolve a canonical BitcoinWalk HTTPS chat URL into an authority-free native route. */
export async function loadBitcoinWalkMobileHref(
  candidate: string,
  signal: AbortSignal,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.origin !== BITCOINWALK_ORIGIN || url.search || url.hash ||
      !parseBitcoinWalkChatPath(url.pathname)) return null;
  const cities = await loadCities(signal);
  return bitcoinWalkMobileHref(await loadBitcoinWalkChatTarget(url.pathname, cities, signal));
}
