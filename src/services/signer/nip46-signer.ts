import type { Event, EventTemplate } from 'nostr-tools';
import { BunkerSigner, type BunkerPointer } from 'nostr-tools/nip46';

import { platform } from '@/platform';
import { normalizeRelayUrl } from '@/lib/nostr/relay-url';

import { relayPool } from '../relay/relay-pool';
import type { Signer } from './signer.interface';
import { Nip46TimeoutError, withNip46Timeout } from './nip46-timeout';

/**
 * When the bunker needs the user to approve a request, it answers with an
 * `auth_url`. Open it so the user can grant the permission in their signer's
 * web/app surface; the original request then completes once approved.
 */
function openAuthUrl(url: string): void {
  void platform.urlOpener.openExternalUrl(url).catch((error) => {
    console.warn('[nip46] Failed to open the authorization URL.', error);
  });
}

/**
 * NIP-46 remote signer (bunker). Wraps nostr-tools' `BunkerSigner` — which
 * already speaks the kind-24133 request/response protocol over a relay and
 * implements NIP-44 — and adapts it to our {@link Signer} interface.
 *
 * `Nip46Signer` is created only from an already-authorised, persisted bunker
 * connection. `BunkerSigner.fromBunker` opens the relay subscription; replaying
 * `connect` here would incorrectly reuse the one-time secret from the original
 * login and compliant remote signers may reject or ignore it.
 * Every method is a network round-trip to the remote signer; nothing here
 * touches a local private key (there is none for a remote account).
 */
export class Nip46Signer implements Signer {
  private inner: BunkerSigner | null = null;
  private connecting: Promise<BunkerSigner> | null = null;
  private connectionGeneration = 0;

  constructor(
    private readonly clientSecretKey: Uint8Array,
    private readonly pointer: BunkerPointer,
  ) {}

  /** Restore the already-authorised bunker session once; concurrent callers
   * share it. The initial `connect` handshake happens in loginWithBunker before
   * the account and client key are persisted. */
  private ensureConnected(): Promise<BunkerSigner> {
    if (this.inner) return Promise.resolve(this.inner);
    if (this.connecting) return this.connecting;
    const generation = ++this.connectionGeneration;
    const pointer = {
      ...this.pointer,
      relays: Array.from(new Set(this.pointer.relays.map(normalizeRelayUrl))),
    };
    const signer = BunkerSigner.fromBunker(this.clientSecretKey, pointer, {
      pool: relayPool.underlyingPool,
      onauth: openAuthUrl,
    });
    const pending = Promise.resolve().then(async () => {
      if (this.connectionGeneration !== generation) {
        await signer.close().catch(() => {});
        throw new Error('NIP-46 connection was superseded.');
      }
      this.inner = signer;
      return signer;
    });
    void pending.finally(() => {
      if (this.connecting === pending) this.connecting = null;
    }).catch(() => {});
    this.connecting = pending;
    return pending;
  }

  private async request<T>(
    operation: string,
    run: (signer: BunkerSigner) => Promise<T>,
  ): Promise<T> {
    const signer = await this.ensureConnected();
    try {
      return await withNip46Timeout(run(signer), operation);
    } catch (error) {
      if (error instanceof Nip46TimeoutError) await this.discard(signer);
      throw error;
    }
  }

  private async discard(signer: BunkerSigner): Promise<void> {
    if (this.inner === signer) {
      this.inner = null;
      this.connectionGeneration += 1;
    }
    await signer.close().catch(() => {});
  }

  async getPublicKey(): Promise<string> {
    return this.request('get_public_key', (signer) => signer.getPublicKey());
  }

  async signEvent(template: EventTemplate): Promise<Event> {
    return this.request('sign_event', (signer) => signer.signEvent(template));
  }

  async nip44Encrypt(peerPubkey: string, plaintext: string): Promise<string> {
    return this.request('nip44_encrypt', (signer) =>
      signer.nip44Encrypt(peerPubkey, plaintext),
    );
  }

  async nip44Decrypt(peerPubkey: string, ciphertext: string): Promise<string> {
    return this.request('nip44_decrypt', (signer) =>
      signer.nip44Decrypt(peerPubkey, ciphertext),
    );
  }

  async destroy(): Promise<void> {
    const inner = this.inner;
    this.inner = null;
    this.connecting = null;
    this.connectionGeneration += 1;
    await inner?.close().catch(() => {});
  }
}
