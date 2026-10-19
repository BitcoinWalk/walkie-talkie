import { buildSigner } from '@/services/account/account.service';
import {
  getDevicePreference,
  setDevicePreference,
} from '@/services/preferences/device-preferences.service';

import {
  joinCommunity,
  type BitcoinWalkCommunityDestination,
} from './community';

const PREFERENCE_PREFIX = 'bitcoinwalk.joinedCommunities.v1';
const MAX_SAVED_DESTINATIONS = 200;
const inFlight = new Map<string, Promise<CommunityMembershipResult>>();

type SavedMemberships = { destinations: string[] };

export type CommunityMembershipResult = {
  joined: string[];
  failed: string[];
  failureReasons: Record<string, string>;
};

export function communityDestinationKey(destination: BitcoinWalkCommunityDestination): string {
  return `${destination.relay}\n${destination.groupId}`;
}

function preferenceKey(accountPubkey: string): string {
  return `${PREFERENCE_PREFIX}.${accountPubkey}`;
}

async function savedMemberships(accountPubkey: string): Promise<Set<string>> {
  try {
    const raw = await getDevicePreference(preferenceKey(accountPubkey));
    if (!raw) return new Set();
    const value = JSON.parse(raw) as SavedMemberships;
    if (!Array.isArray(value.destinations)) return new Set();
    return new Set(value.destinations.filter((item) => typeof item === 'string').slice(-MAX_SAVED_DESTINATIONS));
  } catch {
    return new Set();
  }
}

async function saveMemberships(accountPubkey: string, memberships: Set<string>): Promise<void> {
  await setDevicePreference(preferenceKey(accountPubkey), JSON.stringify({
    destinations: [...memberships].slice(-MAX_SAVED_DESTINATIONS),
  } satisfies SavedMemberships));
}

export async function hasCommunityMembership(
  accountPubkey: string,
  destination: BitcoinWalkCommunityDestination,
): Promise<boolean> {
  return (await savedMemberships(accountPubkey)).has(communityDestinationKey(destination));
}

export function ensureCommunityMemberships(
  accountPubkey: string,
  destinations: BitcoinWalkCommunityDestination[],
): Promise<CommunityMembershipResult> {
  const unique = [...new Map(destinations.map((destination) => [
    communityDestinationKey(destination), destination,
  ])).values()];
  const batchKey = `${accountPubkey}\n${unique.map(communityDestinationKey).sort().join('\n---\n')}`;
  const pending = inFlight.get(batchKey);
  if (pending) return pending;

  const request = (async () => {
    const saved = await savedMemberships(accountPubkey);
    const missing = unique.filter((destination) => !saved.has(communityDestinationKey(destination)));
    if (missing.length === 0) return { joined: [], failed: [], failureReasons: {} };

    const joined: string[] = [];
    const failed: string[] = [];
    const failureReasons: Record<string, string> = {};
    const signer = await buildSigner(accountPubkey);
    try {
      // Keep remote-signer approvals sequential so Amber presents one clear
      // request at a time on the first authenticated app launch.
      for (const destination of missing) {
        const key = communityDestinationKey(destination);
        try {
          await joinCommunity(destination, signer);
          saved.add(key);
          joined.push(key);
          await saveMemberships(accountPubkey, saved);
        } catch (error) {
          failed.push(key);
          const reason = error instanceof Error ? error.message : String(error);
          failureReasons[key] = reason;
          console.warn('[bitcoinwalk.community] Join failed.', {
            relay: destination.relay,
            groupId: destination.groupId,
            reason,
          });
        }
      }
    } finally {
      await signer.destroy?.();
    }
    return { joined, failed, failureReasons };
  })().finally(() => inFlight.delete(batchKey));
  inFlight.set(batchKey, request);
  return request;
}
