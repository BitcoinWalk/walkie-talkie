import type { Event } from 'nostr-tools';

import { platform } from '@/platform';
import { getNotificationsEnabled } from '@/services/notifications/notification-prefs';
import {
  getDevicePreference,
  setDevicePreference,
} from '@/services/preferences/device-preferences.service';
import { relayPool } from '@/services/relay/relay-pool';

import type { BitcoinWalkCommunityDestination } from './community';
import {
  communityDestinationKey,
  listCommunityMemberships,
} from './community-membership';

const PREFERENCE_PREFIX = 'bitcoinwalk.communityNotifications.v1';
const MAX_DESTINATIONS = 50;
const MAX_EVENTS_PER_POLL = 200;
const MAX_IDS_AT_CURSOR = 200;
const preferenceQueues = new Map<string, Promise<void>>();
let liveAccountPubkey: string | null = null;
let liveGeneration = 0;
const liveSubscriptions = new Map<string, { title: string; unsubscribe: () => void }>();

function getNotificationService() {
  // Loaded lazily because the notification service imports the headless poll,
  // which imports this module. At task-run time both modules are initialized.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional cycle-break
  return (require('@/services/notifications/notification.service') as
    typeof import('@/services/notifications/notification.service')).notificationService;
}

export type CommunityNotificationPreference = BitcoinWalkCommunityDestination & {
  title: string;
  muted: boolean;
  cursorCreatedAt: number;
  cursorIds: string[];
};

type StoredPreferences = { destinations: CommunityNotificationPreference[] };

function preferenceKey(accountPubkey: string): string {
  return `${PREFERENCE_PREFIX}.${accountPubkey}`;
}

async function withPreferenceLock<T>(accountPubkey: string, work: () => Promise<T>): Promise<T> {
  const previous = preferenceQueues.get(accountPubkey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  preferenceQueues.set(accountPubkey, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (preferenceQueues.get(accountPubkey) === queued) preferenceQueues.delete(accountPubkey);
  }
}

function validDestination(value: unknown): value is CommunityNotificationPreference {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CommunityNotificationPreference>;
  return typeof item.relay === 'string' && /^wss:\/\//.test(item.relay) &&
    typeof item.groupId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(item.groupId) &&
    typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 200 &&
    typeof item.muted === 'boolean' && Number.isInteger(item.cursorCreatedAt) &&
    (item.cursorCreatedAt ?? -1) >= 0 && Array.isArray(item.cursorIds) &&
    item.cursorIds.every((id) => typeof id === 'string' && /^[0-9a-f]{64}$/.test(id));
}

async function readPreferences(accountPubkey: string): Promise<CommunityNotificationPreference[]> {
  try {
    const raw = await getDevicePreference(preferenceKey(accountPubkey));
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredPreferences;
    if (!Array.isArray(stored.destinations)) return [];
    return stored.destinations.filter(validDestination).slice(-MAX_DESTINATIONS);
  } catch {
    return [];
  }
}

async function writePreferences(
  accountPubkey: string,
  destinations: CommunityNotificationPreference[],
): Promise<void> {
  await setDevicePreference(preferenceKey(accountPubkey), JSON.stringify({
    destinations: destinations.slice(-MAX_DESTINATIONS),
  } satisfies StoredPreferences));
}

function cursorAfter(
  preference: CommunityNotificationPreference,
  events: Event[],
): Pick<CommunityNotificationPreference, 'cursorCreatedAt' | 'cursorIds'> {
  const newestCreatedAt = events.reduce(
    (latest, event) => Math.max(latest, event.created_at),
    preference.cursorCreatedAt,
  );
  const ids = new Set(
    newestCreatedAt === preference.cursorCreatedAt ? preference.cursorIds : [],
  );
  for (const event of events) {
    if (event.created_at === newestCreatedAt) ids.add(event.id);
  }
  return {
    cursorCreatedAt: newestCreatedAt,
    cursorIds: [...ids].slice(-MAX_IDS_AT_CURSOR),
  };
}

function exactTag(event: Pick<Event, 'tags'>, name: string): string | null {
  const matches = event.tags.filter((tag) => tag[0] === name);
  return matches.length === 1 && matches[0].length === 2 ? matches[0][1] ?? null : null;
}

function isNotifiableCommunityMessage(
  event: Event,
  accountPubkey: string,
  preference: CommunityNotificationPreference,
): boolean {
  return event.kind === 9 && event.pubkey !== accountPubkey && event.content.trim().length > 0 &&
    exactTag(event, 'h') === preference.groupId;
}

/** Start tracking a joined group without replaying its old history. */
export async function registerCommunityNotifications(
  accountPubkey: string,
  destination: BitcoinWalkCommunityDestination,
  title = destination.groupId,
): Promise<void> {
  await withPreferenceLock(accountPubkey, async () => {
    const preferences = await readPreferences(accountPubkey);
    const key = communityDestinationKey(destination);
    const existing = preferences.find((item) => communityDestinationKey(item) === key);
    if (existing) {
      if (existing.title === title) return;
      existing.title = title;
    } else {
      preferences.push({
        ...destination,
        title,
        muted: false,
        cursorCreatedAt: Math.floor(Date.now() / 1_000),
        cursorIds: [],
      });
    }
    await writePreferences(accountPubkey, preferences);
  });
  if (platform.notifications.isAvailable() && await getNotificationsEnabled()) {
    await syncCommunityNotificationSubscriptions(accountPubkey);
  }
}

export async function getCommunityMuted(
  accountPubkey: string,
  destination: BitcoinWalkCommunityDestination,
): Promise<boolean> {
  const key = communityDestinationKey(destination);
  return (await readPreferences(accountPubkey))
    .find((item) => communityDestinationKey(item) === key)?.muted ?? false;
}

export async function setCommunityMuted(
  accountPubkey: string,
  destination: BitcoinWalkCommunityDestination,
  muted: boolean,
): Promise<void> {
  await withPreferenceLock(accountPubkey, async () => {
    const preferences = await readPreferences(accountPubkey);
    const key = communityDestinationKey(destination);
    const existing = preferences.find((item) => communityDestinationKey(item) === key);
    if (!existing) {
      preferences.push({
        ...destination,
        title: destination.groupId,
        muted,
        cursorCreatedAt: Math.floor(Date.now() / 1_000),
        cursorIds: [],
      });
    } else {
      existing.muted = muted;
    }
    await writePreferences(accountPubkey, preferences);
  });
}

/** Process an event received by an already-open community subscription. */
export async function observeCommunityNotificationEvent(
  accountPubkey: string,
  destination: BitcoinWalkCommunityDestination,
  title: string,
  event: Event,
): Promise<void> {
  const notification = await withPreferenceLock(accountPubkey, async () => {
    const preferences = await readPreferences(accountPubkey);
    const key = communityDestinationKey(destination);
    let preference = preferences.find((item) => communityDestinationKey(item) === key);
    if (!preference) {
      preference = { ...destination, title, muted: false,
        cursorCreatedAt: Math.floor(Date.now() / 1_000), cursorIds: [] };
      preferences.push(preference);
    } else {
      preference.title = title;
    }
    if (event.created_at < preference.cursorCreatedAt ||
      (event.created_at === preference.cursorCreatedAt && preference.cursorIds.includes(event.id))) {
      await writePreferences(accountPubkey, preferences);
      return null;
    }
    Object.assign(preference, cursorAfter(preference, [event]));
    await writePreferences(accountPubkey, preferences);
    return !preference.muted && isNotifiableCommunityMessage(event, accountPubkey, preference) ? {
      eventId: event.id,
      senderPubkey: event.pubkey,
      content: event.content,
      groupName: preference.title,
      conversationId: communityDestinationKey(preference),
    } : null;
  });
  if (notification) {
    await getNotificationService().notifyCommunityMessages([{
      ...notification,
    }], { accountPubkey });
  }
}

/** Bounded recovery poll used by Android WorkManager and the desktop timer. */
export async function pollCommunityNotifications(
  accountPubkey: string,
  abort?: AbortSignal,
): Promise<void> {
  const [preferences, memberships] = await Promise.all([
    readPreferences(accountPubkey),
    listCommunityMemberships(accountPubkey),
  ]);
  const joined = new Set(memberships.map(communityDestinationKey));
  let changed = false;
  const notifications: {
    eventId: string;
    senderPubkey: string;
    content: string;
    groupName: string;
    conversationId: string;
  }[] = [];

  for (const preference of preferences) {
    if (abort?.aborted) return;
    if (!joined.has(communityDestinationKey(preference))) continue;
    try {
      const events = await relayPool.query({
        relays: [preference.relay],
        filter: {
          kinds: [9],
          '#h': [preference.groupId],
          since: preference.cursorCreatedAt,
          limit: MAX_EVENTS_PER_POLL,
        },
        label: 'bitcoinwalk-community-notifications',
        timeoutMs: 8_000,
        abort,
      });
      const unseen = events.filter((event) =>
        event.created_at > preference.cursorCreatedAt ||
        event.created_at === preference.cursorCreatedAt && !preference.cursorIds.includes(event.id));
      if (unseen.length === 0) continue;
      Object.assign(preference, cursorAfter(preference, unseen));
      changed = true;
      if (!preference.muted) {
        for (const event of unseen) {
          if (!isNotifiableCommunityMessage(event, accountPubkey, preference)) continue;
          notifications.push({
            eventId: event.id,
            senderPubkey: event.pubkey,
            content: event.content,
            groupName: preference.title,
            conversationId: communityDestinationKey(preference),
          });
        }
      }
    } catch (error) {
      if (abort?.aborted) return;
      console.warn('[bitcoinwalk.notifications] Community poll failed.', {
        relay: preference.relay,
        groupId: preference.groupId,
        error,
      });
    }
  }

  if (changed) await writePreferences(accountPubkey, preferences);
  if (notifications.length > 0) {
    await getNotificationService().notifyCommunityMessages(notifications, { accountPubkey });
  }
}

/** Keep one public NIP-29 subscription per joined group while the JS process is
 * resident. The durable cursor makes reconnect overlap and duplicate screen
 * subscriptions harmless. */
export async function syncCommunityNotificationSubscriptions(
  accountPubkey: string,
): Promise<void> {
  const generation = ++liveGeneration;
  const [preferences, memberships] = await Promise.all([
    readPreferences(accountPubkey),
    listCommunityMemberships(accountPubkey),
  ]);
  if (generation !== liveGeneration) return;
  if (liveAccountPubkey !== accountPubkey) {
    for (const subscription of liveSubscriptions.values()) subscription.unsubscribe();
    liveSubscriptions.clear();
    liveAccountPubkey = accountPubkey;
  }

  const joined = new Set(memberships.map(communityDestinationKey));
  const eligible = new Map(preferences
    .filter((preference) => joined.has(communityDestinationKey(preference)))
    .map((preference) => [communityDestinationKey(preference), preference]));
  for (const [key, subscription] of liveSubscriptions) {
    const preference = eligible.get(key);
    if (preference && preference.title === subscription.title) continue;
    subscription.unsubscribe();
    liveSubscriptions.delete(key);
  }
  for (const [key, preference] of eligible) {
    if (liveSubscriptions.has(key)) continue;
    const unsubscribe = relayPool.subscribe({
      relays: [preference.relay],
      filter: {
        kinds: [9],
        '#h': [preference.groupId],
        since: preference.cursorCreatedAt,
        limit: MAX_EVENTS_PER_POLL,
      },
      label: 'bitcoinwalk-community-notifications-live',
      onEvent: (event) => {
        void observeCommunityNotificationEvent(
          accountPubkey,
          preference,
          preference.title,
          event,
        );
      },
    });
    if (generation !== liveGeneration || liveAccountPubkey !== accountPubkey) {
      unsubscribe();
      return;
    }
    liveSubscriptions.set(key, { title: preference.title, unsubscribe });
  }
}

export function stopCommunityNotificationSubscriptions(): void {
  liveGeneration += 1;
  liveAccountPubkey = null;
  for (const subscription of liveSubscriptions.values()) subscription.unsubscribe();
  liveSubscriptions.clear();
}
