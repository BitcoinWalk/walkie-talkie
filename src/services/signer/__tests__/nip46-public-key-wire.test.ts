import { finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { BunkerSigner } from 'nostr-tools/nip46';
import type { AbstractSimplePool } from 'nostr-tools/abstract-pool';

import { readBunkerPublicKey } from '../nip46-public-key';

test('real NIP-46 client recovers when the signer drops post-approval RPCs until its listener is ready', async () => {
  jest.useFakeTimers();
  const clientKey = new Uint8Array(32).fill(1);
  const remoteKey = new Uint8Array(32).fill(2);
  const userPubkey = getPublicKey(new Uint8Array(32).fill(3));
  const conversationKey = nip44.utils.getConversationKey(remoteKey, getPublicKey(clientKey));
  const startedAt = Date.now();
  const requests: { id: string; method: string }[] = [];
  let receive!: (event: Event) => void;
  const close = jest.fn();
  const pool = {
    subscribe: jest.fn((_relays: string[], _filter: unknown, handlers: { onevent: typeof receive }) => {
      receive = handlers.onevent;
      return { close };
    }),
    publish: jest.fn((_relays: string[], event: Event) => {
      const request = JSON.parse(nip44.decrypt(event.content, conversationKey));
      requests.push(request);
      // CONNECT is acknowledged immediately; subsequent ephemeral requests are
      // lost until the signer's background listener catches up.
      if (request.method === 'connect' || Date.now() - startedAt >= 25_000) {
        const content = nip44.encrypt(JSON.stringify({ id: request.id, result: request.method === 'connect' ? 'ack' : userPubkey }), conversationKey);
        queueMicrotask(() => receive(finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', getPublicKey(clientKey)]], content }, remoteKey)));
      }
      return [Promise.resolve('published')];
    }),
  };
  const signer = BunkerSigner.fromBunker(clientKey, { pubkey: getPublicKey(remoteKey), relays: ['wss://example.com/'], secret: 'single-use' }, { pool: pool as unknown as AbstractSimplePool });
  try {
    const pending = (async () => { await signer.connect(); return readBunkerPublicKey(signer); })();
    await jest.advanceTimersByTimeAsync(0);
    expect(requests.map(request => request.method)).toEqual(['connect', 'get_public_key']);
    await jest.advanceTimersByTimeAsync(30_001);
    expect(requests.map(request => request.method)).toEqual(['connect', 'get_public_key', 'get_public_key', 'get_public_key']);
    await expect(pending).resolves.toBe(userPubkey);
    expect(requests.map(request => request.method)).toEqual(['connect', 'get_public_key', 'get_public_key', 'get_public_key']);
    expect(new Set(requests.map(request => request.id)).size).toBe(4);
    expect(pool.subscribe).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(4);
  } finally {
    await signer.close();
    jest.useRealTimers();
  }
});
