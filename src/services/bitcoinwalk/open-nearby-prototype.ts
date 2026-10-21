import { finalizeEvent, verifyEvent, type Event } from 'nostr-tools';
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';

/** Isolated spike format, NOT a Nostr relay event or Nearby v1 packet.
 * A future radio adapter must supply an authenticated encrypted peer link.
 * Session keys identify guests; this module never claims Nostr profile verification.
 */
const DOMAIN = 'bitcoinwalk-open-nearby-spike/1';
const MAX_WIRE_BYTES = 8192;
const MAX_TEXT_BYTES = 2048;
const MAX_NAME_BYTES = 64;
const MAX_SESSION_MESSAGES = 256;
const LIFETIME_SECONDS = 120;
const encoder = new TextEncoder();
const hex64 = /^[0-9a-f]{64}$/;

export type NearbyPrototypeMessage = {
  id: string;
  sender: string;
  name: string;
  text: string;
  identity: 'guest';
};

function validContent(name: unknown, text: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 &&
    encoder.encode(name).length <= MAX_NAME_BYTES && !/[\u0000-\u001f\u007f]/.test(name) &&
    typeof text === 'string' && text.trim().length > 0 && encoder.encode(text).length <= MAX_TEXT_BYTES;
}

/** One receiver challenge per opt-in session; no historical replay to newcomers. */
export function createNearbyPrototypePacket(
  secret: Uint8Array, receiverChallenge: string, name: string, text: string, now: number,
): string {
  if (!hex64.test(receiverChallenge) || !Number.isSafeInteger(now) || now < 0 || !validContent(name, text)) {
    throw new Error('Invalid nearby message');
  }
  return JSON.stringify(finalizeEvent({
    kind: 20000, created_at: now,
    tags: [['protocol', DOMAIN], ['challenge', receiverChallenge]],
    content: JSON.stringify({ name, text, nonce: bytesToHex(randomBytes(32)) }),
  }, secret));
}

/** Bounded direct-neighbor receiver used only by the compatibility harness.
 * ACK is returned only after persist resolves. Concurrent messages receive busy,
 * rather than creating an unbounded async work queue. Leave invalidates in-flight ACKs.
 */
export class NearbyPrototypeReceiver {
  private active = true;
  private busy = false;
  private seen = new Set<string>();

  constructor(
    private readonly challenge: string,
    private readonly peerSessionKey: string,
    private readonly persist: (message: NearbyPrototypeMessage) => Promise<void>,
  ) {
    if (!hex64.test(challenge) || !hex64.test(peerSessionKey)) throw new Error('Invalid nearby session');
  }

  leave(): void { this.active = false; this.seen.clear(); }

  async receive(wire: string, now: number): Promise<'stored' | 'duplicate' | 'rejected' | 'busy'> {
    if (!this.active) return 'rejected';
    if (this.busy) return 'busy';
    if (typeof wire !== 'string' || wire.length > MAX_WIRE_BYTES ||
      encoder.encode(wire).length > MAX_WIRE_BYTES || !Number.isSafeInteger(now)) return 'rejected';
    this.busy = true;
    try {
      const event: Event = JSON.parse(wire);
      if (!event || event.kind !== 20000 || event.pubkey !== this.peerSessionKey ||
        !Number.isSafeInteger(event.created_at) || event.created_at > now + 30 ||
        event.created_at + LIFETIME_SECONDS < now ||
        JSON.stringify(event.tags) !== JSON.stringify([['protocol', DOMAIN], ['challenge', this.challenge]]) ||
        !verifyEvent(event)) return 'rejected';
      const content = JSON.parse(event.content);
      if (!content || !validContent(content.name, content.text) ||
        typeof content.nonce !== 'string' || !hex64.test(content.nonce)) return 'rejected';
      if (this.seen.has(event.id)) return 'duplicate';
      if (this.seen.size >= MAX_SESSION_MESSAGES) return 'busy';
      await this.persist({ id: event.id, sender: event.pubkey, name: content.name,
        text: content.text, identity: 'guest' });
      if (!this.active) return 'rejected';
      this.seen.add(event.id);
      return 'stored';
    } catch {
      return 'rejected';
    } finally {
      this.busy = false;
    }
  }
}
