import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { relayLists } from '@/db/schema';
import { useLiveQuery } from '@/db/use-live-query';
import { IS_IOS } from '@/lib/platform';
import { hasApnsRelay } from '@/services/notifications/apns-relay-eligibility';
import { useActiveAccount } from '@/stores/active-account.store';

/** Observe only the current account's small inbox configuration, never message history. */
export function useApnsRelayEligibility() {
  const pubkey = useActiveAccount((state) => state.activePubkey);
  const query = useLiveQuery(
    db.select({ relayUrl: relayLists.relayUrl }).from(relayLists)
      .where(eq(relayLists.accountPubkey, pubkey ?? '')),
    [pubkey, IS_IOS],
    { enabled: IS_IOS && !!pubkey },
  );
  const resolved = !IS_IOS || !pubkey || query.isResolved;
  return {
    resolved,
    eligible: !IS_IOS || (!!pubkey && query.isResolved && !query.error &&
      hasApnsRelay((query.data ?? []).map((row) => row.relayUrl))),
  };
}
