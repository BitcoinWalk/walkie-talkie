import { normalizeRelayUrl } from '@/lib/nostr/relay-url';

import { APNS_RELAY_URL } from './push-api';

const requiredRelay = normalizeRelayUrl(APNS_RELAY_URL);

/** Only the deployed APNs inbox relay satisfies the iOS notification prerequisite. */
export function hasApnsRelay(relays: readonly string[]): boolean {
  return relays.some((relay) => {
    try { return normalizeRelayUrl(relay) === requiredRelay; }
    catch { return false; }
  });
}
