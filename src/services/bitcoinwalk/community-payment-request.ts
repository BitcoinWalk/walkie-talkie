import { platform } from '@/platform';
import { buildSigner } from '@/services/account/account.service';
import { hasActiveCommunityMembership, sendCommunityMessage,
  type BitcoinWalkCommunityDestination } from './community';

type Request = { id: string; accountPubkey: string;
  destination: BitcoinWalkCommunityDestination; expiresAt: number; sending?: boolean };
let pending: Request | null = null;

/** An account-bound, expiring handoff. Routes carry only an opaque identifier,
 * never an arbitrary relay destination or wallet secret. */
export async function beginCommunityPaymentRequest(accountPubkey: string,
  destination: BitcoinWalkCommunityDestination): Promise<string> {
  const id = await platform.deviceCrypto.randomUUID();
  pending = { id, accountPubkey, destination: { ...destination }, expiresAt: Date.now() + 600_000 };
  return id;
}

export function hasCommunityPaymentRequest(id: unknown, accountPubkey: string | null): boolean {
  return typeof id === 'string' && !!pending && pending.id === id &&
    pending.accountPubkey === accountPubkey && pending.expiresAt > Date.now();
}

export async function sendCommunityPaymentRequest(id: string, accountPubkey: string, invoice: string) {
  if (!hasCommunityPaymentRequest(id, accountPubkey) || !pending) throw new Error('Expired community request');
  const request = pending;
  if (request.sending) throw new Error('Community request already sending');
  request.sending = true;
  let signer: Awaited<ReturnType<typeof buildSigner>> | undefined;
  try {
    signer = await buildSigner(accountPubkey);
    if (await signer.getPublicKey() !== accountPubkey ||
        !await hasActiveCommunityMembership(request.destination, signer) ||
        !hasCommunityPaymentRequest(id, accountPubkey)) throw new Error('Community membership required');
    await sendCommunityMessage({ destination: request.destination, signer,
      content: invoice, previousEventIds: [] });
    if (pending === request) pending = null;
  } finally {
    request.sending = false;
    await signer?.destroy?.();
  }
}
