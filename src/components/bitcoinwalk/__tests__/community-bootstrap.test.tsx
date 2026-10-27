import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockCityDestination = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'bitcoinwalk-madeira' };
const mockGlobalDestination = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'bitcoinwalk-global' };
const mockEnsureMemberships = jest.fn();
const mockHasMembership = jest.fn();
const mockRegisterNotifications = jest.fn();
const mockLoadCities = jest.fn();
const mockSelectCity = jest.fn();
let mockActivePubkey: string | null = 'a'.repeat(64);
const mockSelectedCity = {
  id: 'madeira',
  name: 'Madeira',
  slug: 'madeira',
  aliases: [],
  canonicalUrl: 'https://bitcoinwalk.org/madeira',
  avatarUrl: 'https://bitcoinwalk.org/brand/bitcoinwalk-share-fallback.jpg',
  chat: {
    scope: 'city' as const,
    url: null,
    nip29: mockCityDestination,
    communities: { city: mockCityDestination, global: mockGlobalDestination },
  },
};

jest.mock('@/services/bitcoinwalk/community-membership', () => ({
  ensureCommunityMemberships: (...args: unknown[]) => mockEnsureMemberships(...args),
  hasCommunityMembership: (...args: unknown[]) => mockHasMembership(...args),
}));
jest.mock('@/services/bitcoinwalk/community-notifications', () => ({
  registerCommunityNotifications: (...args: unknown[]) => mockRegisterNotifications(...args),
}));
jest.mock('@/services/bitcoinwalk/cities', () => ({
  communityChoicesForCity: (city: typeof mockSelectedCity) => [
    { scope: 'city', destination: city.chat.communities.city },
    { scope: 'global', destination: city.chat.communities.global },
  ],
  loadCities: (...args: unknown[]) => mockLoadCities(...args),
}));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { activePubkey: string | null }) => unknown) =>
    selector({ activePubkey: mockActivePubkey }),
}));
jest.mock('@/stores/selected-city.store', () => ({
  useSelectedCity: (selector: (state: {
    selectedCity: typeof mockSelectedCity;
    select: jest.Mock;
  }) => unknown) => selector({ selectedCity: mockSelectedCity, select: mockSelectCity }),
}));

// Imports follow the hoisted Jest module factories above.
// eslint-disable-next-line import/first
import { BitcoinWalkCommunityBootstrap } from '../BitcoinWalkCommunityBootstrap';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('BitcoinWalk community bootstrap', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePubkey = 'a'.repeat(64);
    mockLoadCities.mockResolvedValue([mockSelectedCity]);
    mockEnsureMemberships.mockResolvedValue({ joined: [], failed: [], failureReasons: {} });
    mockHasMembership.mockResolvedValue(true);
    mockRegisterNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('requests selected-city membership without automatically joining Global', async () => {
    await act(async () => {
      renderer = create(<BitcoinWalkCommunityBootstrap />);
      await settle();
    });

    expect(mockEnsureMemberships).toHaveBeenCalledWith(
      'a'.repeat(64),
      [mockCityDestination],
    );
  });

  it('does not request membership before a Nostr account is active', async () => {
    mockActivePubkey = null;
    await act(async () => {
      renderer = create(<BitcoinWalkCommunityBootstrap />);
      await settle();
    });

    expect(mockEnsureMemberships).not.toHaveBeenCalled();
  });
});
