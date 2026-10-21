import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { createNearbyPrototypePacket, NearbyPrototypeReceiver } from '../open-nearby-prototype';

describe('open Nearby two-peer compatibility harness (not a radio test)', () => {
  const alice = generateSecretKey();
  const bob = generateSecretKey();
  const challengeA = 'a'.repeat(64);
  const challengeB = 'b'.repeat(64);
  const now = 1000;

  it('exchanges text and names both ways without city or account membership', async () => {
    const atA = jest.fn(async () => {});
    const atB = jest.fn(async () => {});
    const a = new NearbyPrototypeReceiver(challengeA, getPublicKey(bob), atA);
    const b = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), atB);
    expect(await b.receive(createNearbyPrototypePacket(alice, challengeB, 'Alice', 'Hi Bob', now), now)).toBe('stored');
    expect(await a.receive(createNearbyPrototypePacket(bob, challengeA, 'Bob', 'Hi Alice', now), now)).toBe('stored');
    expect(atB).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', text: 'Hi Bob', identity: 'guest' }));
    expect(atA).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bob', text: 'Hi Alice' }));
  });

  it('deduplicates and refuses packets for old sessions and another peer', async () => {
    const save = jest.fn(async () => {});
    const b = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), save);
    const packet = createNearbyPrototypePacket(alice, challengeB, 'Same name', 'Hello', now);
    expect(await b.receive(packet, now)).toBe('stored');
    expect(await b.receive(packet, now)).toBe('duplicate');
    expect(await b.receive(createNearbyPrototypePacket(alice, challengeA, 'Alice', 'Old session', now), now)).toBe('rejected');
    expect(await b.receive(createNearbyPrototypePacket(bob, challengeB, 'Alice', 'Spoof', now), now)).toBe('rejected');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects tampering, malformed, oversized and expired packets', async () => {
    const b = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), jest.fn());
    const packet = createNearbyPrototypePacket(alice, challengeB, 'Alice', 'Hi', now);
    expect(await b.receive(packet.replace('Alice', 'Eve'), now)).toBe('rejected');
    expect(await b.receive('null', now)).toBe('rejected');
    expect(await b.receive('x'.repeat(8193), now)).toBe('rejected');
    expect(await b.receive(packet, now + 121)).toBe('rejected');
    expect(() => createNearbyPrototypePacket(alice, challengeB, 'Alice', 'x'.repeat(2049), now)).toThrow();
  });

  it('keeps two deliberate identical messages in the same second distinct', async () => {
    const save = jest.fn(async () => {});
    const b = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), save);
    const first = createNearbyPrototypePacket(alice, challengeB, 'Alice', 'Hi', now);
    const second = createNearbyPrototypePacket(alice, challengeB, 'Alice', 'Hi', now);
    expect(await b.receive(first, now)).toBe('stored');
    expect(await b.receive(second, now)).toBe('stored');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge failed storage, or finish delivery after leaving', async () => {
    const packet = createNearbyPrototypePacket(alice, challengeB, 'Alice', 'Hi', now);
    const failed = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), async () => { throw Error('disk'); });
    expect(await failed.receive(packet, now)).toBe('rejected');
    let finish!: () => void;
    const b = new NearbyPrototypeReceiver(challengeB, getPublicKey(alice), () => new Promise((resolve) => { finish = resolve; }));
    const pending = b.receive(packet, now);
    expect(await b.receive(packet, now)).toBe('busy');
    b.leave();
    finish();
    expect(await pending).toBe('rejected');
    expect(await b.receive(packet, now)).toBe('rejected');
  });
});
