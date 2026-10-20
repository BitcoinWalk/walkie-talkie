import type { BunkerSigner } from 'nostr-tools/nip46';

import { withNip46Timeout } from './nip46-timeout';

/** The signer can acknowledge CONNECT before its listener is ready for the
 * next ephemeral RPC. Retry only this read, on the same authorised session.
 * Never replay CONNECT, its one-time secret, or a signing/encryption request.
 * Keep all replies eligible so a delayed earlier response can still finish. */
export async function readBunkerPublicKey(
  signer: Pick<BunkerSigner, 'getPublicKey'>,
): Promise<string> {
  let settled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const pending = new Promise<string>((resolve, reject) => {
    const read = () => {
      if (settled) return;
      void Promise.resolve().then(() => signer.getPublicKey()).then(resolve, reject);
    };
    timers.push(setTimeout(read, 10_000), setTimeout(read, 30_000));
    read();
  });
  try {
    return await withNip46Timeout(pending, 'get_public_key');
  } finally {
    settled = true;
    timers.forEach(clearTimeout);
  }
}
