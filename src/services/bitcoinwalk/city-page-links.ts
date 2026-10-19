import type { BitcoinWalkCity } from './cities';

export type PublicCommunityScope = 'city' | 'global';

/** Requests the compact city-page presentation intended for the native shell. */
export function appCityPageUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  url.searchParams.set('view', 'app');
  return url.toString();
}

function normalizedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function armadaUrl(relay: string, groupId: string): string | null {
  try {
    const relayUrl = new URL(relay);
    return `https://armada.buzz/s/${relayUrl.hostname}/${encodeURIComponent(groupId)}`;
  } catch {
    return null;
  }
}

/** Maps a public city-page chat link back to its verified native community. */
export function communityScopeForCityPageUrl(
  city: BitcoinWalkCity,
  candidate: string,
): PublicCommunityScope | null {
  const normalizedCandidate = normalizedUrl(candidate);
  if (!normalizedCandidate) return null;
  if (city.chat.url && normalizedCandidate === normalizedUrl(city.chat.url)) {
    return city.chat.scope;
  }
  for (const scope of ['city', 'global'] as const) {
    const destination = city.chat.communities[scope];
    if (!destination) continue;
    const externalUrl = armadaUrl(destination.relay, destination.groupId);
    if (externalUrl && normalizedCandidate === normalizedUrl(externalUrl)) return scope;
  }
  return null;
}
