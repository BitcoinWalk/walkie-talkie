import type { Event } from 'nostr-tools';

const mockPreferences = new Map<string, string>();
const mockQuery = jest.fn();
const mockSubscribe = jest.fn((_options: unknown) => jest.fn());
const mockNotify = jest.fn(async (_messages: unknown[], _options: unknown) => {});
const destination = { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'madeira' };
const account = 'a'.repeat(64);

jest.mock('@/services/preferences/device-preferences.service', () => ({
  getDevicePreference: jest.fn(async (key: string) => mockPreferences.get(key) ?? null),
  setDevicePreference: jest.fn(async (key: string, value: string) => {
    mockPreferences.set(key, value);
  }),
}));

jest.mock('@/services/relay/relay-pool', () => ({
  relayPool: {
    query: (...args: unknown[]) => mockQuery(...args),
    subscribe: (options: unknown) => mockSubscribe(options),
  },
}));

jest.mock('@/platform', () => ({
  platform: { notifications: { isAvailable: () => true } },
}));

jest.mock('@/services/notifications/notification-prefs', () => ({
  getNotificationsEnabled: jest.fn(async () => true),
}));

jest.mock('@/services/notifications/notification.service', () => ({
  notificationService: {
    notifyCommunityMessages: (messages: unknown[], options: unknown) =>
      mockNotify(messages, options),
  },
}));

jest.mock('../community-membership', () => ({
  communityDestinationKey: (value: { relay: string; groupId: string }) =>
    `${value.relay}\n${value.groupId}`,
  listCommunityMemberships: jest.fn(async () => [destination]),
}));

// Imports follow the hoisted Jest factories above.
// eslint-disable-next-line import/first
import {
  getCommunityMuted,
  pollCommunityNotifications,
  registerCommunityNotifications,
  setCommunityMuted,
  stopCommunityNotificationSubscriptions,
} from '../community-notifications';

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'b'.repeat(64),
    pubkey: 'c'.repeat(64),
    created_at: 1_001,
    kind: 9,
    tags: [['h', destination.groupId], ['p', account]],
    content: 'Hello @walker',
    sig: 'd'.repeat(128),
    ...overrides,
  };
}

describe('BitcoinWalk community notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopCommunityNotificationSubscriptions();
    mockPreferences.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockQuery.mockResolvedValue([]);
    mockSubscribe.mockImplementation((_options: unknown) => jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts at the current time so joining never replays old messages', async () => {
    await registerCommunityNotifications(account, destination, 'BitcoinWalk Madeira');
    mockQuery.mockResolvedValue([event({ created_at: 999 })]);

    await pollCommunityNotifications(account);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      filter: expect.objectContaining({ since: 1_000 }),
    }));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('delivers a direct p-tag mention once and advances its durable cursor', async () => {
    await registerCommunityNotifications(account, destination, 'BitcoinWalk Madeira');
    mockQuery.mockResolvedValue([event()]);

    await pollCommunityNotifications(account);
    await pollCommunityNotifications(account);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith([expect.objectContaining({
      senderPubkey: 'c'.repeat(64),
      content: 'Hello @walker',
      groupName: 'BitcoinWalk Madeira',
    })], { accountPubkey: account });
  });

  it('uses a resident subscription for prompt delivery while the process is alive', async () => {
    await registerCommunityNotifications(account, destination, 'BitcoinWalk Madeira');
    const subscription = mockSubscribe.mock.calls[0]?.[0] as {
      onEvent: (value: Event) => void;
    };

    subscription.onEvent(event());
    for (let index = 0; index < 12; index += 1) await Promise.resolve();

    expect(mockNotify).toHaveBeenCalledWith([
      expect.objectContaining({ groupName: 'BitcoinWalk Madeira' }),
    ], { accountPubkey: account });
  });

  it('keeps advancing a muted community without presenting its messages', async () => {
    await registerCommunityNotifications(account, destination, 'BitcoinWalk Madeira');
    await setCommunityMuted(account, destination, true);
    expect(await getCommunityMuted(account, destination)).toBe(true);
    mockQuery.mockResolvedValue([event()]);

    await pollCommunityNotifications(account);

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('notifies for ordinary group messages while ignoring self-authored messages', async () => {
    await registerCommunityNotifications(account, destination, 'BitcoinWalk Madeira');
    mockQuery.mockResolvedValue([
      event({ id: 'e'.repeat(64), tags: [['h', destination.groupId]], content: '@walker' }),
      event({ id: 'f'.repeat(64), pubkey: account }),
    ]);

    await pollCommunityNotifications(account);

    expect(mockNotify).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'e'.repeat(64), content: '@walker' }),
    ], { accountPubkey: account });
  });
});
