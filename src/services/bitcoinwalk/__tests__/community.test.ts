import type { Event, EventTemplate } from 'nostr-tools';

import {
  joinCommunity,
  loadCommunity,
  loadCommunityMetadata,
  mergeCommunityMessages,
  sendCommunityMessage,
} from '../community';
import { relayPool } from '@/services/relay/relay-pool';
import type { Signer } from '@/services/signer/signer.interface';

jest.mock('@/services/relay/relay-pool', () => ({
  relayPool: {
    query: jest.fn(),
    publishEvent: jest.fn(),
    subscribe: jest.fn(),
  },
}));

const destination = { relay: 'wss://madeira.bitcoinwalk.org', groupId: 'bitcoinwalk-madeira' };
const signer: Signer = {
  getPublicKey: jest.fn(async () => 'a'.repeat(64)),
  signEvent: jest.fn(async (template: EventTemplate) => event(template.kind, template.content,
    template.tags, template.created_at, 'a'.repeat(64))),
};

function event(
  kind: number,
  content: string,
  tags: string[][],
  createdAt = 10,
  pubkey = 'b'.repeat(64),
): Event {
  const id = `${kind.toString(16).padStart(4, '0')}${createdAt.toString(16).padStart(4, '0')}`.padEnd(64, '0');
  return { id, kind, content, tags, created_at: createdAt, pubkey, sig: 'c'.repeat(128) };
}

describe('BitcoinWalk NIP-29 community service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(relayPool.query).mockResolvedValue([]);
  });

  it('reads exact metadata and chronological messages from one verified destination', async () => {
    jest.mocked(relayPool.query).mockResolvedValue([
      event(9, 'Second', [['h', destination.groupId]], 12),
      event(39000, '', [['d', destination.groupId], ['name', 'BitcoinWalk in Madeira'], ['about', 'Walk together']], 9),
      event(9, 'Wrong group', [['h', 'other']], 11),
      event(9, 'First', [['h', destination.groupId]], 10),
    ]);
    await expect(loadCommunity(destination)).resolves.toEqual({
      metadata: { name: 'BitcoinWalk in Madeira', about: 'Walk together' },
      roster: { memberPubkeys: [] },
      messages: [
        expect.objectContaining({ content: 'First', createdAt: 10 }),
        expect.objectContaining({ content: 'Second', createdAt: 12 }),
      ],
    });
    expect(relayPool.query).toHaveBeenCalledWith(expect.objectContaining({
      relays: [destination.relay],
      filters: expect.arrayContaining([
        expect.objectContaining({ kinds: [39000], '#d': [destination.groupId] }),
        expect.objectContaining({ kinds: [9], '#h': [destination.groupId] }),
      ]),
    }));
    const filters = jest.mocked(relayPool.query).mock.calls[0][0].filters;
    expect(filters).not.toContainEqual(expect.objectContaining({ kinds: [39002] }));
  });

  it('loads public metadata without requesting member-only messages', async () => {
    jest.mocked(relayPool.query).mockResolvedValue([
      event(39000, '', [
        ['d', destination.groupId],
        ['name', 'BitcoinWalk Madeira'],
        ['about', 'Walk together'],
      ], 9),
    ]);

    await expect(loadCommunityMetadata(destination)).resolves.toEqual({
      name: 'BitcoinWalk Madeira',
      about: 'Walk together',
    });
    expect(relayPool.query).toHaveBeenCalledWith(expect.objectContaining({
      relays: [destination.relay],
      filter: { kinds: [39000], '#d': [destination.groupId], limit: 1 },
    }));
  });

  it('uses the connected identity for a private community relay challenge', async () => {
    jest.mocked(relayPool.query).mockResolvedValue([
      event(39002, '', [['d', destination.groupId], ['p', 'd'.repeat(64)]], 9),
    ]);
    await expect(loadCommunity(destination, undefined, signer)).resolves.toEqual(expect.objectContaining({
      roster: { memberPubkeys: ['d'.repeat(64)] },
    }));
    const request = jest.mocked(relayPool.query).mock.calls[0][0];
    expect(request.filters).toContainEqual(expect.objectContaining({
      kinds: [39002], '#d': [destination.groupId],
    }));
    await request.signAuth?.({ kind: 22242, created_at: 10, tags: [], content: 'challenge' });
    expect(signer.signEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 22242 }));
  });

  it('deduplicates messages and rejects another group or oversized content', () => {
    const accepted = event(9, 'Hello', [['h', destination.groupId]], 10);
    const merged = mergeCommunityMessages([], [
      accepted,
      accepted,
      event(9, 'Wrong', [['h', 'other']], 11),
      event(9, 'x'.repeat(4_001), [['h', destination.groupId]], 12),
    ], destination.groupId);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe('Hello');
  });

  it('signs an exact join request and treats relay duplicate as already joined', async () => {
    jest.mocked(relayPool.publishEvent).mockResolvedValue([
      { url: destination.relay, outcome: { ok: false, reason: 'duplicate: already a member' } },
    ]);
    await expect(joinCommunity(destination, signer)).resolves.toBe('already-joined');
    expect(relayPool.query).toHaveBeenCalledWith(expect.objectContaining({
      relays: [destination.relay],
      filter: expect.objectContaining({
        kinds: [9000, 9001],
        '#h': [destination.groupId],
        '#p': ['a'.repeat(64)],
      }),
      signAuth: expect.any(Function),
    }));
    expect(jest.mocked(relayPool.query).mock.invocationCallOrder[0])
      .toBeLessThan(jest.mocked(signer.signEvent).mock.invocationCallOrder[0]);
    expect(signer.signEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 9021, tags: [['h', destination.groupId]], content: '',
    }));
  });

  it('does not ask for the join signature when relay authentication fails', async () => {
    jest.mocked(relayPool.query).mockRejectedValue(new Error('auth failed: approval was cancelled'));

    await expect(joinCommunity(destination, signer)).rejects.toThrow('approval was cancelled');
    expect(signer.signEvent).not.toHaveBeenCalled();
    expect(relayPool.publishEvent).not.toHaveBeenCalled();
  });

  it('does not publish another join when authenticated membership is already active', async () => {
    jest.mocked(relayPool.query).mockResolvedValue([
      event(9000, '', [
        ['h', destination.groupId],
        ['p', 'a'.repeat(64)],
      ], 15),
    ]);

    await expect(joinCommunity(destination, signer)).resolves.toBe('already-joined');
    expect(relayPool.publishEvent).not.toHaveBeenCalled();
    expect(signer.signEvent).not.toHaveBeenCalled();
  });

  it('publishes the exact kind 9 profile accepted by populated BitcoinWalk groups', async () => {
    jest.mocked(relayPool.publishEvent).mockResolvedValue([
      { url: destination.relay, outcome: { ok: true } },
    ]);
    const ids = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64)];
    await sendCommunityMessage({ destination, signer, content: ' Hello ', previousEventIds: ids });
    expect(signer.signEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 9,
      content: 'Hello',
      tags: [['h', destination.groupId]],
    }));
  });
});
