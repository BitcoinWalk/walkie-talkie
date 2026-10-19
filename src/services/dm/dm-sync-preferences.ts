import {
  deleteDevicePreference,
  getDevicePreference,
  setDevicePreference,
} from '@/services/preferences/device-preferences.service';

const DEFERRED_SYNC_PREFIX = 'bitcoinwalk.dmSyncDeferred.v1';

function preferenceKey(accountPubkey: string): string {
  return `${DEFERRED_SYNC_PREFIX}.${accountPubkey}`;
}

/**
 * BitcoinWalk's NIP-29 communities do not depend on PsstPsst's optional NIP-4E
 * private-message key. Remember when a user chooses community access without
 * recovering that key so a later launch does not block the whole application.
 */
export async function isDmSyncDeferred(accountPubkey: string): Promise<boolean> {
  return (await getDevicePreference(preferenceKey(accountPubkey))) === '1';
}

export async function deferDmSync(accountPubkey: string): Promise<void> {
  await setDevicePreference(preferenceKey(accountPubkey), '1');
}

export async function clearDeferredDmSync(accountPubkey: string): Promise<void> {
  await deleteDevicePreference(preferenceKey(accountPubkey));
}
