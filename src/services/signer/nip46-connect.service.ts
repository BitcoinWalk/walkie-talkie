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
import { recordAppDiagnostic } from '@/services/diagnostics/app-error-diagnostics.service';

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
const APP_IMAGE = 'https://bitcoinwalk.org/app/walkie-talkie/icon.png';
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
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'bunker_app_backgrounded',
      });
      return;
    }
    if (leftForeground) {
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'bunker_app_returned',
      });
      resolveReturned();
    }
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

  const recover = returned.then(async () => {
    void recordAppDiagnostic({
      level: 'info',
      area: 'remote_signing',
      code: 'bunker_recovery_started',
    });
    // Let the managed relay pool restore a socket before publishing the probe.
    await new Promise<void>((resolve) => setTimeout(resolve, FOREGROUND_RECOVERY_DELAY_MS));
    try {
      const pubkey = await readBunkerPublicKey(signer);
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'bunker_recovery_succeeded',
      });
      return pubkey;
    } catch (error) {
      void recordAppDiagnostic({
        level: 'warning',
        area: 'remote_signing',
        code: `bunker_recovery_${classifyBunkerLoginError(error)}`,
      });
      throw error;
    }
  });
  const connect = signer
    .connect({ name: APP_NAME, url: APP_URL, image: APP_IMAGE })
    .then(() => {
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'bunker_approval_received',
      });
      // Amber can approve CONNECT before Android brings this app back to the
      // foreground. Starting get_public_key here would publish on a socket the
      // OS still considers offline. Defer that follow-up to the same foreground
      // recovery probe used when the original CONNECT response is interrupted.
      if (leftForeground && platform.appState.currentState() !== 'active') {
        void recordAppDiagnostic({
          level: 'info',
          area: 'remote_signing',
          code: 'bunker_public_key_deferred_until_foreground',
        });
        return recover;
      }
      return null;
    })
    .catch((error: unknown) => {
      // A background reachability transition can still reject the original
      // CONNECT wait on devices that suspend the websocket aggressively. Once
      // Amber was opened, do not fail the login before the user returns; share
      // the single recovery probe instead of replaying the one-time secret.
      if (!leftForeground) throw error;
      void recordAppDiagnostic({
        level: 'warning',
        area: 'remote_signing',
        code: 'bunker_connection_interrupted_in_background',
      });
      return recover;
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
  void recordAppDiagnostic({
    level: 'info',
    area: 'remote_signing',
    code: 'bunker_attempt_started',
  });
  const trimmed = input.trim();
  // Bunker links only — `parseBunkerInput` would also resolve a `name@domain`
  // NIP-05, which we deliberately don't accept here.
  if (!BUNKER_REGEX.test(trimmed)) {
    void recordAppDiagnostic({ level: 'warning', area: 'remote_signing', code: 'bunker_invalid_link' });
    throw new BunkerLoginError('invalid_link');
  }
  const pointer = await parseBunkerInput(trimmed);
  if (!pointer || pointer.relays.length === 0) {
    void recordAppDiagnostic({ level: 'warning', area: 'remote_signing', code: 'bunker_missing_relay' });
    throw new BunkerLoginError('invalid_link');
  }
  try {
    pointer.relays = Array.from(new Set(pointer.relays.map(normalizeRelayUrl)));
  } catch {
    void recordAppDiagnostic({ level: 'warning', area: 'remote_signing', code: 'bunker_invalid_relay' });
    throw new BunkerLoginError('invalid_link');
  }
  void recordAppDiagnostic({
    level: 'info',
    area: 'remote_signing',
    code: 'bunker_link_accepted',
    detail: `relay_count=${pointer.relays.length}`,
  });

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
    void recordAppDiagnostic({
      level: 'info',
      area: 'remote_signing',
      code: 'bunker_public_key_received',
    });
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
    void recordAppDiagnostic({
      level: 'info',
      area: 'remote_signing',
      code: 'bunker_account_saved',
    });
    return { pubkey };
  } catch (error) {
    const code = classifyBunkerLoginError(error);
    void recordAppDiagnostic({
      level: 'error',
      area: 'remote_signing',
      code: `bunker_${code}`,
    });
    throw new BunkerLoginError(code);
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
  // URLSearchParams serializes spaces as `+`. Amber currently presents that
  // value literally in its application list, so keep the visible name exact.
  const uri = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: APP_NAME,
    url: APP_URL,
    image: APP_IMAGE,
  }).replace('name=Walkie+Talkie', 'name=Walkie%20Talkie');

  const controller = new AbortController();
  let settled = false;
  let cancelRequested = false;
  void recordAppDiagnostic({
    level: 'info',
    area: 'remote_signing',
    code: 'nostr_connect_session_created',
    detail: `relay_count=${relays.length}`,
  });

  const waitForConnection = async (): Promise<{ pubkey: string }> => {
    try {
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'nostr_connect_waiting',
      });
      const signer = await withNip46Timeout(
        BunkerSigner.fromURI(
          clientSecretKey,
          uri,
          {
            pool: relayPool.underlyingPool,
            onauth: openAuthUrl,
            // Keep the initial Nostr Connect exchange on the relay that Amber
            // just approved. nostr-tools otherwise sends switch_relays before
            // we can read the account pubkey; signers that do not complete that
            // optional request leave the required get_public_key call waiting.
            skipSwitchRelays: true,
          },
          controller.signal,
        ),
        'connection',
        NIP46_PAIRING_TIMEOUT_MS,
        () => controller.abort(),
      );
      void recordAppDiagnostic({
        level: 'info',
        area: 'remote_signing',
        code: 'nostr_connect_signer_connected',
      });
      try {
        const pubkey = await readBunkerPublicKey(signer);
        void recordAppDiagnostic({
          level: 'info',
          area: 'remote_signing',
          code: 'nostr_connect_public_key_received',
        });
        await addRemoteAccount({
          pubkey,
          pointer: signer.bp,
          clientSecretKeyHex: bytesToHex(clientSecretKey),
        });
        void recordAppDiagnostic({
          level: 'info',
          area: 'remote_signing',
          code: 'nostr_connect_account_saved',
        });
        settled = true;
        return { pubkey };
      } finally {
        await signer.close().catch(() => {});
      }
    } catch (error) {
      settled = true;
      if (!cancelRequested) {
        void recordAppDiagnostic({
          level: 'error',
          area: 'remote_signing',
          code: `nostr_connect_${classifyBunkerLoginError(error)}`,
        });
      }
      throw error;
    }
  };

  return {
    uri,
    waitForConnection,
    cancel: () => {
      if (!settled && !controller.signal.aborted) {
        cancelRequested = true;
        void recordAppDiagnostic({
          level: 'info',
          area: 'remote_signing',
          code: 'nostr_connect_cancelled',
        });
      }
      settled = true;
      controller.abort();
    },
  };
}
