import type { Event, Filter } from 'nostr-tools';

import { relayPool } from '@/services/relay/relay-pool';
import type { Signer } from '@/services/signer/signer.interface';

export type BitcoinWalkCommunityDestination = { relay: string; groupId: string };
export type BitcoinWalkCommunityMetadata = {
  name: string | null;
  about: string | null;
};
export type BitcoinWalkCommunityRoster = {
  memberPubkeys: string[];
};
export type BitcoinWalkCommunityMessage = {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
};

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4_000;

function tag(event: Event, name: string): string | null {
  return event.tags.find((item) => item[0] === name)?.[1] ?? null;
}

function messagesFilter(groupId: string): Filter {
  return { kinds: [9], '#h': [groupId], limit: MAX_MESSAGES };
}

function latestMetadata(
  events: Event[],
  groupId: string,
): BitcoinWalkCommunityMetadata {
  const metadata = events
    .filter((event) => event.kind === 39000 && tag(event, 'd') === groupId)
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0];
  return {
    name: metadata ? tag(metadata, 'name') : null,
    about: metadata ? tag(metadata, 'about') : null,
  };
}

/** Public channel details used before a person joins. Message history is kept
 * out of this query because BitcoinWalk communities restrict it to members. */
export async function loadCommunityMetadata(
  destination: BitcoinWalkCommunityDestination,
  abort?: AbortSignal,
): Promise<BitcoinWalkCommunityMetadata> {
  const events = await relayPool.query({
    relays: [destination.relay],
    filter: { kinds: [39000], '#d': [destination.groupId], limit: 1 },
    label: 'bitcoinwalk-community-metadata',
    timeoutMs: 8_000,
    abort,
  });
  return latestMetadata(events, destination.groupId);
}

export function mergeCommunityMessages(
  current: BitcoinWalkCommunityMessage[],
  events: Event[],
  groupId: string,
): BitcoinWalkCommunityMessage[] {
  const incoming: BitcoinWalkCommunityMessage[] = [];
  for (const event of events) {
    if (event.kind !== 9 || tag(event, 'h') !== groupId ||
        event.content.length === 0 || event.content.length > MAX_MESSAGE_LENGTH) continue;
    incoming.push({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
    });
  }
  return mergeCommunityMessageModels(current, incoming);
}

export function mergeCommunityMessageModels(
  current: BitcoinWalkCommunityMessage[],
  incoming: BitcoinWalkCommunityMessage[],
): BitcoinWalkCommunityMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(-MAX_MESSAGES);
}

export async function loadCommunity(
  destination: BitcoinWalkCommunityDestination,
  abort?: AbortSignal,
  signer?: Signer,
): Promise<{
  metadata: BitcoinWalkCommunityMetadata;
  roster: BitcoinWalkCommunityRoster;
  messages: BitcoinWalkCommunityMessage[];
}> {
  const filters: Filter[] = [
    { kinds: [39000], '#d': [destination.groupId], limit: 1 },
    ...(signer ? [{ kinds: [39002], '#d': [destination.groupId], limit: 1 } satisfies Filter] : []),
    messagesFilter(destination.groupId),
  ];
  const events = await relayPool.query({
    relays: [destination.relay],
    filters,
    label: 'bitcoinwalk-community',
    timeoutMs: 8_000,
    abort,
    signAuth: signer ? (template) => signer.signEvent(template) : undefined,
  });
  const roster = events
    .filter((event) => event.kind === 39002 && tag(event, 'd') === destination.groupId)
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0];
  return {
    metadata: latestMetadata(events, destination.groupId),
    roster: {
      memberPubkeys: [...new Set((roster?.tags ?? [])
        .filter((item) => item[0] === 'p' && /^[0-9a-f]{64}$/.test(item[1] ?? ''))
        .map((item) => item[1]))],
    },
    messages: mergeCommunityMessages([], events, destination.groupId),
  };
}

export function subscribeCommunity(
  destination: BitcoinWalkCommunityDestination,
  onMessage: (event: Event) => void,
  signer?: Signer,
): () => void {
  return relayPool.subscribe({
    relays: [destination.relay],
    filter: messagesFilter(destination.groupId),
    label: 'bitcoinwalk-community-live',
    onEvent: onMessage,
    signAuth: signer ? (template) => signer.signEvent(template) : undefined,
  });
}

export async function joinCommunity(
  destination: BitcoinWalkCommunityDestination,
  signer: Signer,
): Promise<'joined' | 'already-joined'> {
  const pubkey = await signer.getPublicKey();
  const membership = await relayPool.query({
    relays: [destination.relay],
    filter: {
      kinds: [9000, 9001],
      '#h': [destination.groupId],
      '#p': [pubkey],
      limit: 10,
    },
    label: 'bitcoinwalk-community-membership',
    timeoutMs: 8_000,
    signAuth: (template) => signer.signEvent(template),
  });
  const latestMembership = membership
    .filter((event) => (event.kind === 9000 || event.kind === 9001) &&
      tag(event, 'h') === destination.groupId &&
      event.tags.some((item) => item[0] === 'p' && item[1] === pubkey))
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0];
  if (latestMembership?.kind === 9000) return 'already-joined';

  const event = await signer.signEvent({
    kind: 9021,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [['h', destination.groupId]],
    content: '',
  });
  const [result] = await relayPool.publishEvent({
    relays: [destination.relay], event, signer, timeoutMs: 10_000,
  });
  if (result?.outcome.ok) return 'joined';
  const reason = result?.outcome.ok === false ? result.outcome.reason : '';
  if (/^duplicate:/i.test(reason)) return 'already-joined';
  throw new Error(reason || 'The community could not be joined.');
}

export async function sendCommunityMessage(input: {
  destination: BitcoinWalkCommunityDestination;
  signer: Signer;
  content: string;
  previousEventIds: string[];
}): Promise<Event> {
  const content = input.content.trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error('Enter a shorter message.');
  const previous = [...new Set(input.previousEventIds)]
    .filter((id) => /^[0-9a-f]{64}$/.test(id))
    .slice(-3)
    .map((id) => id.slice(0, 8));
  const event = await input.signer.signEvent({
    kind: 9,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ['h', input.destination.groupId],
      ...(previous.length > 0 ? [['previous', ...previous]] : []),
    ],
    content,
  });
  const [result] = await relayPool.publishEvent({
    relays: [input.destination.relay], event, signer: input.signer, timeoutMs: 10_000,
  });
  if (!result?.outcome.ok) {
    throw new Error(result?.outcome.ok === false ? result.outcome.reason : 'The message could not be sent.');
  }
  return event;
}
