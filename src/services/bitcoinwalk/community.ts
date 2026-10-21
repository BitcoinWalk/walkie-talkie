import type { Event, Filter } from 'nostr-tools';

import type { QuickReaction } from '@/lib/nostr/quick-reaction';
import { mentionedPubkeys } from '@/lib/nostr/mentions';
import { normalizeReactionDisplay, type ReactionAggregate } from '@/lib/nostr/reactions';
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
  tags: string[][];
  replyToId: string | null;
  reactions: BitcoinWalkCommunityReaction[];
};
export type BitcoinWalkCommunityReaction = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
};

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4_000;

function tag(event: Event, name: string): string | null {
  return event.tags.find((item) => item[0] === name)?.[1] ?? null;
}

function messagesFilter(groupId: string): Filter {
  return { kinds: [9, 7], '#h': [groupId], limit: MAX_MESSAGES };
}

function exactTag(event: Pick<Event, 'tags'>, name: string): string | null {
  const matches = event.tags.filter((item) => item[0] === name);
  return matches.length === 1 && matches[0].length === 2 ? matches[0][1] ?? null : null;
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
  const reactions: BitcoinWalkCommunityReaction[] = [];
  for (const event of events) {
    if (exactTag(event, 'h') !== groupId) continue;
    if (event.kind === 9 && event.content.length > 0 && event.content.length <= MAX_MESSAGE_LENGTH) {
      incoming.push({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        tags: event.tags,
        replyToId: exactTag(event, 'e'),
        reactions: [],
      });
    } else if (event.kind === 7 && event.content.trim() && exactTag(event, 'e')) {
      reactions.push({ id: event.id, pubkey: event.pubkey, content: event.content, tags: event.tags });
    }
  }
  const merged = mergeCommunityMessageModels(current, incoming);
  if (reactions.length === 0) return merged;
  return merged.map((message) => {
    const additions = reactions.filter((reaction) => exactTag(reaction, 'e') === message.id);
    if (additions.length === 0) return message;
    const byId = new Map(message.reactions.map((reaction) => [reaction.id, reaction]));
    for (const reaction of additions) byId.set(reaction.id, reaction);
    return { ...message, reactions: [...byId.values()] };
  });
}

export function mergeCommunityMessageModels(
  current: BitcoinWalkCommunityMessage[],
  incoming: BitcoinWalkCommunityMessage[],
): BitcoinWalkCommunityMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing ? { ...message, reactions: existing.reactions } : message);
  }
  return [...byId.values()]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(-MAX_MESSAGES);
}

export function aggregateCommunityReactions(
  message: BitcoinWalkCommunityMessage,
  accountPubkey: string,
): ReactionAggregate[] {
  const buckets = new Map<string, ReactionAggregate>();
  for (const reaction of message.reactions) {
    const { emoji, customEmoji } = normalizeReactionDisplay(reaction.content, reaction.tags);
    const key = customEmoji
      ? `custom\u0000${customEmoji.shortcode.toLowerCase()}\u0000${customEmoji.url}`
      : `unicode\u0000${emoji}`;
    const existing = buckets.get(key) ?? {
      emoji,
      customEmoji,
      count: 0,
      selfReacted: false,
      selfReactionId: null,
    };
    existing.count += 1;
    if (reaction.pubkey === accountPubkey) {
      existing.selfReacted = true;
      existing.selfReactionId = reaction.id;
    }
    buckets.set(key, existing);
  }
  return [...buckets.values()];
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

export async function hasActiveCommunityMembership(
  destination: BitcoinWalkCommunityDestination,
  signer: Signer,
  abort?: AbortSignal,
): Promise<boolean> {
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
    abort,
    signAuth: (template) => signer.signEvent(template),
  });
  const latestMembership = membership
    .filter((event) => (event.kind === 9000 || event.kind === 9001) &&
      tag(event, 'h') === destination.groupId &&
      event.tags.some((item) => item[0] === 'p' && item[1] === pubkey))
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0];
  return latestMembership?.kind === 9000;
}

export async function joinCommunity(
  destination: BitcoinWalkCommunityDestination,
  signer: Signer,
): Promise<'joined' | 'already-joined'> {
  if (await hasActiveCommunityMembership(destination, signer)) return 'already-joined';

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
  /** Retained for media-call compatibility; replies use the exact `replyToId`. */
  previousEventIds: string[];
  replyToId?: string | null;
}): Promise<Event> {
  const content = input.content.trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error('Enter a shorter message.');
  const replyToId = input.replyToId ?? null;
  if (replyToId && !/^[0-9a-f]{64}$/.test(replyToId)) throw new Error('Invalid reply target.');
  const event = await input.signer.signEvent({
    kind: 9,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ['h', input.destination.groupId],
      ...(replyToId ? [['e', replyToId]] : []),
      ...mentionedPubkeys(content).map((pubkey) => ['p', pubkey]),
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


export async function sendCommunityReaction(input: {
  destination: BitcoinWalkCommunityDestination;
  signer: Signer;
  targetId: string;
  reaction: QuickReaction;
}): Promise<Event> {
  if (!/^[0-9a-f]{64}$/.test(input.targetId)) throw new Error('Invalid reaction target.');
  const custom = typeof input.reaction === 'string' ? null : input.reaction;
  const content = typeof input.reaction === 'string'
    ? input.reaction
    : `:${input.reaction.shortcode}:`;
  if (!content.trim()) throw new Error('Choose a reaction.');
  const event = await input.signer.signEvent({
    kind: 7,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ['h', input.destination.groupId],
      ['e', input.targetId],
      ...(custom ? [['emoji', custom.shortcode, custom.url]] : []),
    ],
    content,
  });
  const [result] = await relayPool.publishEvent({
    relays: [input.destination.relay], event, signer: input.signer, timeoutMs: 10_000,
  });
  if (!result?.outcome.ok) {
    throw new Error(result?.outcome.ok === false ? result.outcome.reason : 'The reaction could not be sent.');
  }
  return event;
}
