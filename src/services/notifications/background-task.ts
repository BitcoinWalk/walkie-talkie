import { platform } from '@/platform';
import type { Rumor } from '@/db/schema/types';
import { getActiveAccountPubkey } from '@/services/account/account.service';
import { refreshUnreadIndicator } from '@/services/conversation/unread-count.service';
import { dmService } from '@/services/dm/dm.service';
import { MessagingKeySyncRequiredError, receiveSessionStore } from '@/services/dm/receive-session';
import { pollCommunityNotifications } from '@/services/bitcoinwalk/community-notifications';

import { getNotificationsEnabled } from './notification-prefs';

/**
 * Periodic recovery poll on Android (WorkManager) and desktop (main-process timer).
 * iOS has no periodic worker and receives background messages through APNs.
 * When scheduled, this task refreshes receive metadata, pages recent gift wraps,
 * stores new messages, and posts one aggregated privacy-configured notification.
 * Android recovery is best-effort after the resident process exits, with a
 * minimum interval of 15 minutes; the OS determines the actual cadence.
 */
export const BACKGROUND_POLL_TASK = 'psstpsst-background-poll';
/** Floor only — the OS decides actual cadence (15 min is the platform minimum). */
const MINIMUM_INTERVAL_MINUTES = 15;

// Define at module top level so the OS can invoke it even on a cold launch (the
// app was killed) — this module is eagerly imported from the root layout.
platform.backgroundTask.defineTasks(
  [BACKGROUND_POLL_TASK],
  async ({ signal }) => {
    if (signal.aborted) return;
    const pubkey = await getActiveAccountPubkey();
    if (!pubkey) return;
    if (!(await getNotificationsEnabled())) return;
    if (signal.aborted) return;

    let rumors: Rumor[] = [];
    try {
      rumors = await dmService.pollForNotifications(pubkey, { abort: signal });
    } catch (error) {
      if (!(error instanceof MessagingKeySyncRequiredError)) throw error;
      const session = receiveSessionStore.getState();
      if (session.status !== 'key-required' || session.accountPubkey !== pubkey) return;
      // Private receiving needs the recovered key, but the same worker still
      // owns BitcoinWalk public-community recovery below.
      await platform.backgroundMessaging.stop();
    }
    if (rumors.length > 0) {
      // Required lazily to avoid a load-time cycle (notification.service →
      // background-task). By task-run time it's fully initialised.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional cycle-break
      const { notificationService } = require(
        './notification.service',
      ) as typeof import('./notification.service');
      // The poll doesn't count or filter: it hands freshly-stored rumors to the
      // single funnel and refreshes the database-derived badge in parallel.
      // Awaiting the funnel also keeps a headless task alive through its short
      // delivery until the OS call completes. This poll already produced one
      // bounded batch, so it bypasses the live path's timer-backed aggregation.
      await Promise.all([
        notificationService.notifyNewRumors(rumors, { flushImmediately: true, accountPubkey: pubkey }),
        refreshUnreadIndicator(pubkey),
      ]);
    }
    if (!signal.aborted) await pollCommunityNotifications(pubkey, signal);
  },
);

export async function registerBackgroundPoll(): Promise<void> {
  await platform.backgroundTask.register(MINIMUM_INTERVAL_MINUTES);
}

export async function unregisterBackgroundPoll(): Promise<void> {
  await platform.backgroundTask.unregister();
}
