import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import type { NoisePort, NoiseRole } from '@/platform/ports/noise';
import {
  createNearbyPrototypePacket, NearbyPrototypeReceiver, type NearbyPrototypeMessage,
} from './open-nearby-prototype';

// Experimental link only. No radio discovery, private Nearby access or relay publishing.
const DOMAIN = 'bitcoinwalk-open-nearby-spike/1';
const MAX_RECORD = 16384;
const TEXT = 0x20;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** One fresh guest identity per link. Noise protects the hop, not the public room.
 * The radio adapter must use a separate service/ownership boundary. Never feed
 * these frames into the private Nearby runtime. A connected key is not a Nostr identity.
 */
export class OpenNearbyLink {
  private phase: 'a' | 'b' | 'c' | 'connected' | 'closed' = 'a';
  private session?: string;
  private receiver?: NearbyPrototypeReceiver;
  private peerChallenge?: string;
  private busy = false;
  private readonly deadline: number;

  private constructor(
    private readonly port: NoisePort,
    private readonly role: NoiseRole,
    private readonly handshake: string,
    private readonly secret: Uint8Array,
    private readonly challenge: string,
    private readonly persist: (message: NearbyPrototypeMessage) => Promise<void>,
    private readonly clock: () => number,
  ) { this.deadline = clock() + 30000; }

  static async create(
    port: NoisePort, role: NoiseRole,
    persist: (message: NearbyPrototypeMessage) => Promise<void>,
    clock = Date.now,
  ): Promise<OpenNearbyLink> {
    const key = await port.generateKeyPair();
    try {
      const handshake = await port.createHandshake(role, key.privateKey);
      return new OpenNearbyLink(port, role, handshake, generateSecretKey(),
        bytesToHex(randomBytes(32)), persist, clock);
    } finally { key.privateKey.fill(0); }
  }

  get connected(): boolean { return this.phase === 'connected'; }

  private hello(): Uint8Array {
    return encoder.encode(JSON.stringify({ protocol: DOMAIN,
      key: getPublicKey(this.secret), challenge: this.challenge }));
  }

  private acceptHello(payload: Uint8Array): void {
    if (payload.length > 512) throw new Error('Oversized Nearby handshake');
    const hello = JSON.parse(decoder.decode(payload));
    if (hello?.protocol !== DOMAIN || typeof hello.key !== 'string' ||
      !/^[a-f0-9]{64}$/.test(hello.key) || typeof hello.challenge !== 'string' ||
      !/^[a-f0-9]{64}$/.test(hello.challenge)) throw new Error('Incompatible Nearby peer');
    this.peerChallenge = hello.challenge;
    this.receiver = new NearbyPrototypeReceiver(this.challenge, hello.key, this.persist);
  }

  private async operation<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Nearby link busy');
    if (this.phase === 'closed') throw new Error('Nearby link closed');
    this.busy = true;
    try {
      if (!this.connected && this.clock() > this.deadline) throw new Error('Nearby handshake expired');
      const result = await work();
      if (this.phase as string === 'closed') throw new Error('Nearby link closed');
      return result;
    } catch (error) {
      await this.close();
      throw error;
    } finally { this.busy = false; }
  }

  /** Initiator sends A. No name, stable identity or city is in this cleartext payload. */
  start(): Promise<Uint8Array> {
    return this.operation(async () => {
      if (this.role !== 'initiator' || this.phase !== 'a') throw new Error('Unexpected handshake');
      const frame = await this.port.writeHandshake(this.handshake, encoder.encode(DOMAIN));
      if (this.phase as string !== 'closed') this.phase = 'b';
      return frame;
    });
  }

  /** Returns the next handshake frame, or null when the responder finishes C. */
  receiveHandshake(frame: Uint8Array): Promise<Uint8Array | null> {
    return this.operation(async () => {
      if (frame.length > 1024 || this.connected) throw new Error('Invalid handshake frame');
      const payload = await this.port.readHandshake(this.handshake, frame);
      if (this.role === 'responder' && this.phase === 'a') {
        if (decoder.decode(payload) !== DOMAIN) throw new Error('Incompatible Nearby peer');
        const reply = await this.port.writeHandshake(this.handshake, this.hello());
        if (this.phase as string !== 'closed') this.phase = 'c';
        return reply;
      }
      if ((this.role === 'initiator' && this.phase === 'b') ||
        (this.role === 'responder' && this.phase === 'c')) {
        this.acceptHello(payload);
        const reply = this.role === 'initiator'
          ? await this.port.writeHandshake(this.handshake, this.hello()) : null;
        const session = await this.port.finishHandshake(this.handshake, MAX_RECORD);
        if (this.phase as string === 'closed') {
          await this.port.destroySession(session.handle);
          throw new Error('Nearby link closed');
        }
        this.session = session.handle;
        this.phase = 'connected';
        return reply;
      }
      throw new Error('Unexpected handshake');
    });
  }

  send(name: string, text: string): Promise<Uint8Array> {
    return this.operation(async () => {
      if (!this.connected || !this.session || !this.peerChallenge) throw new Error('Nearby not connected');
      const payload = encoder.encode(createNearbyPrototypePacket(this.secret,
        this.peerChallenge, name, text, Math.floor(this.clock() / 1000)));
      if (await this.port.shouldRotateSession(this.session, payload.length)) {
        throw new Error('Nearby session expired; rejoin');
      }
      return this.port.seal(this.session, TEXT, payload);
    });
  }

  receive(frame: Uint8Array): Promise<'stored' | 'duplicate' | 'rejected' | 'busy'> {
    return this.operation(async () => {
      if (!this.connected || !this.session || !this.receiver || frame.length > MAX_RECORD) {
        throw new Error('Invalid Nearby record');
      }
      const record = await this.port.open(this.session, frame);
      if (record.type !== TEXT) throw new Error('Unsupported Nearby record');
      return this.receiver.receive(decoder.decode(record.payload), Math.floor(this.clock() / 1000));
    });
  }

  async close(): Promise<void> {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.receiver?.leave();
    this.secret.fill(0);
    this.peerChallenge = undefined;
    // Native destroy is idempotent, including a handshake consumed by finish.
    await Promise.all([
      this.port.destroyHandshake(this.handshake),
      this.session ? this.port.destroySession(this.session) : Promise.resolve(),
    ]);
  }
}
