import type { Event } from 'nostr-tools';

import { buildSigner } from '@/services/account/account.service';
import { relayPool } from '@/services/relay/relay-pool';

import { loadCities, type BitcoinWalkCity } from './cities';
import { loadBitcoinWalkChatDirectory, type BitcoinWalkChatDirectory } from './chat-directory';
import { communityDestinationKey } from './community-membership';
import type { BitcoinWalkCommunityDestination } from './community';

export type BitcoinWalkInbox = {
  directory: BitcoinWalkChatDirectory;
  cities: BitcoinWalkCity[];
  hosts: boolean;
  membershipError?: boolean;
};

// The shared relay accepts one exact group per membership filter and at most
// 200 results. Eight filters leave room under its 16-listener socket budget.
const MEMBERSHIP_FILTER_BATCH = 8;
const MEMBERSHIP_HISTORY_LIMIT = 10;

/** Bounded membership reads, not one request per city. Only verified directory
 * destinations are eligible. Reading the inbox never joins a community. */
export async function loadJoinedDestinations(
  accountPubkey: string,
  destinations: BitcoinWalkCommunityDestination[],
  signal: AbortSignal,
): Promise<Set<string>> {
  const byRelay = new Map<string, Set<string>>();
  for (const destination of destinations) {
    const ids = byRelay.get(destination.relay) ?? new Set<string>();
    ids.add(destination.groupId);
    byRelay.set(destination.relay, ids);
  }
  const joined = new Set<string>();
  const signer = await buildSigner(accountPubkey);
  try {
    for (const [relay, ids] of byRelay) {
      const groupIds = [...ids];
      for (let offset = 0; offset < groupIds.length; offset += MEMBERSHIP_FILTER_BATCH) {
        if (signal.aborted) throw new Error('Aborted');
        const batch = groupIds.slice(offset, offset + MEMBERSHIP_FILTER_BATCH);
        const allowed = new Set(batch);
        const events = await relayPool.query({
          relays: [relay],
          filters: batch.map((groupId) => ({
            kinds: [9000, 9001], '#h': [groupId], '#p': [accountPubkey],
            limit: MEMBERSHIP_HISTORY_LIMIT,
          })),
          label: 'bitcoinwalk-inbox-memberships',
          timeoutMs: 8_000,
          abort: signal,
          signAuth: (template) => signer.signEvent(template),
        });
        const latest = new Map<string, Event>();
        for (const event of events) {
          const groupId = event.tags.find((tag) => tag[0] === 'h')?.[1];
          if (!groupId || !allowed.has(groupId) || ![9000, 9001].includes(event.kind) ||
              !event.tags.some((tag) => tag[0] === 'p' && tag[1] === accountPubkey)) continue;
          const previous = latest.get(groupId);
          if (!previous || event.created_at > previous.created_at ||
              event.created_at === previous.created_at && event.id > previous.id) {
            latest.set(groupId, event);
          }
        }
        for (const [groupId, event] of latest) {
          if (event.kind === 9000) joined.add(communityDestinationKey({ relay, groupId }));
        }
      }
    }
    return joined;
  } finally {
    await signer.destroy?.();
  }
}

export async function loadBitcoinWalkInbox(
  accountPubkey: string,
  signal: AbortSignal,
): Promise<BitcoinWalkInbox> {
  const [cities, directory] = await Promise.all([
    loadCities(signal), loadBitcoinWalkChatDirectory(signal),
  ]);
  let joined = new Set<string>();
  let membershipError = false;
  try {
    joined = await loadJoinedDestinations(accountPubkey,
      cities.flatMap((city) => city.chat.communities.city ? [city.chat.communities.city] : []), signal);
  } catch (cause) {
    if (signal.aborted) throw cause;
    membershipError = true;
  }
  // A private-room denial must not prevent public city membership discovery.
  let hosts = false;
  try {
    const privateJoined = await loadJoinedDestinations(accountPubkey, [directory.communities.hosts], signal);
    hosts = privateJoined.has(communityDestinationKey(directory.communities.hosts));
  } catch (cause) {
    if (signal.aborted) throw cause;
    membershipError = true;
  }
  return {
    directory,
    cities: cities.filter((city) => city.chat.communities.city &&
      joined.has(communityDestinationKey(city.chat.communities.city)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    hosts,
    ...(membershipError ? {membershipError: true} : {}),
  };
}
