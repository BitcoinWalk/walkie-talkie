import { BITCOINWALK_ORIGIN } from './config';
import {
  isWalkieTalkieDestination,
} from './cities';
import type { BitcoinWalkCommunityDestination } from './community';

export type BitcoinWalkChatDirectory = {
  guidePubkey: string;
  communities: {
    global: BitcoinWalkCommunityDestination;
    hosts: BitcoinWalkCommunityDestination;
  };
};

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

export function parseBitcoinWalkChatDirectory(value: unknown): BitcoinWalkChatDirectory {
  const directory = value as Partial<BitcoinWalkChatDirectory> & { version?: unknown } | null;
  if (
    directory?.version !== 1 ||
    typeof directory.guidePubkey !== 'string' ||
    !HEX_PUBKEY.test(directory.guidePubkey) ||
    !directory.communities ||
    !isWalkieTalkieDestination(directory.communities.global) ||
    !isWalkieTalkieDestination(directory.communities.hosts)
  ) {
    throw new Error('Invalid BitcoinWalk chat directory');
  }
  return {
    guidePubkey: directory.guidePubkey,
    communities: {
      global: directory.communities.global,
      hosts: directory.communities.hosts,
    },
  };
}

export async function loadBitcoinWalkChatDirectory(
  signal: AbortSignal,
): Promise<BitcoinWalkChatDirectory> {
  const response = await fetch(`${BITCOINWALK_ORIGIN}/api/chat/guide`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('BitcoinWalk chats unavailable');
  const body = await response.text();
  if (body.length > 20_000) throw new Error('BitcoinWalk chat directory too large');
  return parseBitcoinWalkChatDirectory(JSON.parse(body));
}
