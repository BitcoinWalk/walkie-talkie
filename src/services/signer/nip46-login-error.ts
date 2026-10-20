import { Nip46TimeoutError } from './nip46-timeout';

export type BunkerLoginFailure =
  | 'invalid_link'
  | 'expired_link'
  | 'signer_locked'
  | 'rejected'
  | 'timeout'
  | 'relay_unavailable'
  | 'save_failed'
  | 'connection_failed';

/** Stable, non-secret failure codes for login feedback. Never display the raw
 * signer/relay error: it may contain a credential or a private endpoint. */
export class BunkerLoginError extends Error {
  constructor(readonly code: BunkerLoginFailure) {
    super(`Bunker login: ${code}`);
    this.name = 'BunkerLoginError';
  }
}

export function classifyBunkerLoginError(error: unknown): BunkerLoginFailure {
  if (error instanceof BunkerLoginError) return error.code;
  if (error instanceof Nip46TimeoutError) return 'timeout';
  if (error instanceof AggregateError) return 'relay_unavailable';
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  // These are Amber's explicit NIP-46 error responses, not link contents.
  if (/^(invalid secret|no secret|already connected|secret not in use)$/i.test(message)) return 'expired_link';
  if (/\blocked\b|unlock your device/i.test(message)) return 'signer_locked';
  if (/^(user rejected|rejected|no permission|permission denied|access denied)$/i.test(message)) return 'rejected';
  if (/\b(?:banned|rate[- ]?limit(?:ed| violations?)?)\b/i.test(message)) return 'relay_unavailable';
  return 'connection_failed';
}
