import { generateSecretKey, getPublicKey } from 'nostr-tools';
import {
  BUNKER_REGEX,
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
} from 'nostr-tools/nip46';

import { bytesToHex } from '@/lib/nostr/keys';
import { normalizeRelayUrl } from '@/lib/nostr/relay-url';
import { platform } from '@/platform';

import { addRemoteAccount } from '../account/account.service';
import { relayPool } from '../relay/relay-pool';
import {
  NIP46_PAIRING_TIMEOUT_MS,
  withNip46Timeout,
} from './nip46-timeout';
import { BunkerLoginError, classifyBunkerLoginError } from './nip46-login-error';
import { readBunkerPublicKey } from './nip46-public-key';

export type BunkerLoginPhase = 'approval' | 'public_key' | 'saving';

/** Dedicated, ephemeral BitcoinWalk NIP-46 rendezvous transport. Keeping
 * app-initiated pairing off shared public relays avoids third-party bans and
 * rate limits during Amber approval. The user can still override this via the
 * screen's advanced setting. */
export const NIP46_DEFAULT_RELAYS = ['wss://remote.bitcoinwalk.org/'];

const APP_NAME = 'Walkie Talkie';
const APP_URL = 'https://bitcoinwalk.org';
const FOREGROUND_RECOVERY_DELAY_MS = 500;

function openAuthUrl(url: string): void {
  void platform.urlOpener.openExternalUrl(url).catch((error) => {
    console.warn('[nip46] Failed to open the authorization URL.', error);
  });
}

/** Android may suspend the client's websocket while Amber is in front. Since
 * NIP-46 replies are ephemeral, CONNECT can be approved successfully while its
 * one-time response is lost. Once the user returns, probe the now-authorised
 * session with get_public_key; this is safe to repeat and proves that Amber
 * accepted the client without replaying the one-time CONNECT secret. */
async function connectWithForegroundRecovery(
  signer: Pick<BunkerSigner, 'connect' | 'getPublicKey'>,
  signal: AbortSignal,
): Promise<string | null> {
  let leftForeground = platform.appState.currentState() !== 'active';
  let resolveReturned!: () => void;
  const returned = new Promise<void>((resolve) => { resolveReturned = resolve; });
  const removeListener = platform.appState.addChangeListener((state) => {
    if (state !== 'active') {
      leftForeground = true;
      return;
    }
    if (leftForeground) resolveReturned();
  });
  let rejectAborted!: (reason: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  const abort = () => {
    const error = new Error('Bunker connection cancelled.');
    error.name = 'AbortError';
    rejectAborted(error);
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();

  const connect = signer
    .connect({ name: APP_NAME, url: APP_URL })
    .then(() => null);
  const recover = returned.then(async () => {
    // Let the managed relay pool restore a socket before publishing the probe.
    await new Promise<void>((resolve) => setTimeout(resolve, FOREGROUND_RECOVERY_DELAY_MS));
    return readBunkerPublicKey(signer);
  });

  try {
    // A failed early probe must not discard an otherwise valid CONNECT wait.
    // It commonly means the user returned before pressing Amber's Connect.
    return await Promise.race([
      connect,
      recover.catch(() => new Promise<never>(() => {})),
      aborted,
    ]);
  } finally {
    removeListener();
    signal.removeEventListener('abort', abort);
  }
}

/**
 * Connect to a bunker from a pasted `bunker://…` URL, then persist the account
 * and return its signing pubkey. We connect here (rather than lazily) because
 * the signing pubkey isn't known until the handshake completes — the bunker
 * reports it, and it may differ from the pubkey embedded in the URI. The
 * temporary connection is closed afterwards; the next use (bootstrap) reconnects
 * lazily with the same authorised client key.
 */
export async function loginWithBunker(
  input: string,
  onPhase?: (phase: BunkerLoginPhase) => void,
): Promise<{ pubkey: string }> {
  const trimmed = input.trim();
  // Bunker links only — `parseBunkerInput` would also resolve a `name@domain`
  // NIP-05, which we deliberately don't accept here.
  if (!BUNKER_REGEX.test(trimmed)) throw new BunkerLoginError('invalid_link');
  const pointer = await parseBunkerInput(trimmed);
  if (!pointer || pointer.relays.length === 0) throw new BunkerLoginError('invalid_link');
  try {
    pointer.relays = Array.from(new Set(pointer.relays.map(normalizeRelayUrl)));
  } catch {
    throw new BunkerLoginError('invalid_link');
  }

  // Android can leave the shared relay pool with the offline hint it emitted
  // while Amber was in front. Refresh before the first interactive publish so
  // a healthy signer transport is actually attempted.
  await relayPool.refreshNetworkState();

  const clientSecretKey = generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, {
    pool: relayPool.underlyingPool,
    onauth: openAuthUrl,
  });
  const recoveryController = new AbortController();
  try {
    onPhase?.('approval');
    const recoveredPubkey = await withNip46Timeout(
      connectWithForegroundRecovery(signer, recoveryController.signal),
      'connection',
      NIP46_PAIRING_TIMEOUT_MS,
      () => recoveryController.abort(),
    );
    onPhase?.('public_key');
    const pubkey = recoveredPubkey ?? await readBunkerPublicKey(signer);
    onPhase?.('saving');
    try {
      await addRemoteAccount({
        pubkey,
        // The secret authorises this first handshake only. Persist the bunker and
        // relay coordinates, but never retain or replay the consumed credential.
        pointer: { ...signer.bp, secret: null },
        clientSecretKeyHex: bytesToHex(clientSecretKey),
      });
    } catch {
      throw new BunkerLoginError('save_failed');
    }
    return { pubkey };
  } catch (error) {
    throw new BunkerLoginError(classifyBunkerLoginError(error));
  } finally {
    recoveryController.abort();
    await signer.close().catch(() => {});
  }
}

export type NostrConnectSession = {
  /** The `nostrconnect://…` URI — render it as a QR and as a tappable deep link. */
  uri: string;
  /** Resolves with the signing pubkey once a signer connects back; rejects if
   * cancelled. Persists the account before resolving. */
  waitForConnection: () => Promise<{ pubkey: string }>;
  /** Abort an in-flight `waitForConnection`. */
  cancel: () => void;
};

/**
 * Start the Nostr Connect (app-initiated) flow: mint a fresh client key, build a
 * `nostrconnect://` URI for the user to open in / scan with their signer, and
 * wait for the signer to connect back. The same client key is persisted so the
 * account reconnects on later launches.
 */
export function startNostrConnect(opts?: { relays?: string[] }): NostrConnectSession {
  const relays = Array.from(new Set(
    (opts?.relays?.length ? opts.relays : NIP46_DEFAULT_RELAYS).map(normalizeRelayUrl),
  ));
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  // A one-time secret the signer must echo back so we accept only the bunker we
  // invited (not any relay eavesdropper replaying the URI).
  const secret = bytesToHex(generateSecretKey());
  const uri = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: APP_NAME,
  });

  const controller = new AbortController();

  const waitForConnection = async (): Promise<{ pubkey: string }> => {
    const signer = await withNip46Timeout(
      BunkerSigner.fromURI(
        clientSecretKey,
        uri,
        { pool: relayPool.underlyingPool, onauth: openAuthUrl },
        controller.signal,
      ),
      'connection',
      NIP46_PAIRING_TIMEOUT_MS,
      () => controller.abort(),
    );
    try {
      const pubkey = await readBunkerPublicKey(signer);
      await addRemoteAccount({
        pubkey,
        pointer: signer.bp,
        clientSecretKeyHex: bytesToHex(clientSecretKey),
      });
      return { pubkey };
    } finally {
      await signer.close().catch(() => {});
    }
  };

  return { uri, waitForConnection, cancel: () => controller.abort() };
}
