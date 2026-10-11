import { eq } from 'drizzle-orm';

import { db, type Database } from '@/db/client';
import { accounts, devicePreferences } from '@/db/schema';

export function accountRemovalPreferenceKey(accountPubkey: string): string {
  return `account.removing.${accountPubkey}`;
}

/** Check inside the write transaction when another process may remove the owner. */
export async function canReceiveForAccount(accountPubkey: string, tx: Database = db): Promise<boolean> {
  const row = await tx.select({ pubkey: accounts.pubkey, removing: devicePreferences.value })
    .from(accounts)
    .leftJoin(devicePreferences, eq(devicePreferences.key, accountRemovalPreferenceKey(accountPubkey)))
    .where(eq(accounts.pubkey, accountPubkey)).get();
  return !!row && row.removing !== '1';
}
