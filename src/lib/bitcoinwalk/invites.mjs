const origins = {
  production: 'https://bitcoinwalk.org',
  staging: 'https://app-staging.bitcoinwalk.org',
};
const cityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const eventPattern = /^[0-9a-f]{64}$/;

/** Public navigation only; a link never grants private group membership. */
export function createWalkInvite({ cityId, eventId, environment = 'production' }) {
  if (!cityPattern.test(cityId) || (eventId !== undefined && !eventPattern.test(eventId)) || !origins[environment]) {
    throw new Error('Invalid BitcoinWalk invite');
  }
  const url = new URL(`/walkie/city/${cityId}`, origins[environment]);
  if (eventId) url.searchParams.set('event', eventId);
  return url.href;
}

export function parseWalkInvite(value, environment = 'production') {
  try {
    if (typeof value !== 'string' || value.length > 512) return null;
    const url = new URL(value);
    if (!origins[environment] || url.origin !== origins[environment] || url.username || url.password || url.hash) return null;
    const match = /^\/walkie\/city\/([^/]+)$/.exec(url.pathname);
    if (!match || !cityPattern.test(match[1])) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => key !== 'event') || keys.length > 1) return null;
    const eventId = url.searchParams.get('event');
    if (eventId !== null && !eventPattern.test(eventId)) return null;
    return { cityId: match[1], ...(eventId ? { eventId } : {}), environment };
  } catch {
    return null;
  }
}
