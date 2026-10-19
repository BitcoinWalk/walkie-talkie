import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockHasActiveMembership = jest.fn();
const mockDestroy = jest.fn();
type MockRailProps = { destinations: { key: string }[] };
const mockRail = jest.fn((_props: MockRailProps) => null);
const mockCommunityView = jest.fn((_props: { embeddedScope: string }) => null);
const mockSelectScope = jest.fn();

const mockHosts = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'bitcoinwalk-organizers' };
const mockCity = {
  id: 'madeira',
  name: 'Madeira',
  slug: 'madeira',
  avatarUrl: 'https://bitcoinwalk.org/madeira.png',
  chat: {
    communities: {
      city: { relay: mockHosts.relay, groupId: 'bitcoinwalk-madeira' },
      global: { relay: mockHosts.relay, groupId: 'bitcoinwalk-global' },
    },
  },
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/common/AppScreen', () => ({
  AppScreen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/common/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/bitcoinwalk/BitcoinWalkChatRail', () => ({
  BitcoinWalkChatRail: (props: unknown) => mockRail(props as MockRailProps),
}));
jest.mock('@/app/(app)/community', () => ({
  BitcoinWalkCommunityView: (props: unknown) =>
    mockCommunityView(props as { embeddedScope: string }),
}));
jest.mock('@/services/account/account.service', () => ({
  buildSigner: jest.fn(async () => ({ destroy: mockDestroy })),
}));
jest.mock('@/services/bitcoinwalk/community', () => ({
  hasActiveCommunityMembership: (...args: unknown[]) => mockHasActiveMembership(...args),
}));
jest.mock('@/services/bitcoinwalk/cities', () => ({
  communityChoicesForCity: () => [
    { scope: 'city', destination: mockCity.chat.communities.city },
    { scope: 'global', destination: mockCity.chat.communities.global },
  ],
}));
jest.mock('@/services/bitcoinwalk/chat-directory', () => ({
  loadBitcoinWalkChatDirectory: jest.fn(async () => ({
    guidePubkey: 'b'.repeat(64),
    communities: { global: mockCity.chat.communities.global, hosts: mockHosts },
  })),
}));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { activePubkey: string }) => unknown) =>
    selector({ activePubkey: 'a'.repeat(64) }),
}));
jest.mock('@/stores/bitcoinwalk-community.store', () => ({
  useBitcoinWalkCommunity: (selector: (state: { scope: 'city'; select: jest.Mock }) => unknown) =>
    selector({ scope: 'city', select: mockSelectScope }),
}));
jest.mock('@/stores/selected-city.store', () => ({
  useSelectedCity: (selector: (state: { selectedCity: typeof mockCity }) => unknown) =>
    selector({ selectedCity: mockCity }),
}));
jest.mock('@/stores/theme.store', () => ({
  useThemeStore: (selector: (state: { accent: 'blue'; preference: 'light' }) => unknown) =>
    selector({ accent: 'blue', preference: 'light' }),
}));

// Imports follow the hoisted Jest module factories above.
// eslint-disable-next-line import/first
import BitcoinWalkChatsTab from '@/app/(app)/(tabs)/index';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function latestDestinationKeys(): string[] {
  const props = mockRail.mock.calls.at(-1)?.[0];
  if (!props) throw new Error('Chat rail was not rendered');
  return props.destinations.map((destination) => destination.key);
}

describe('BitcoinWalk chat destination access', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('omits Hosts when the signed-in identity is not an active member', async () => {
    mockHasActiveMembership.mockResolvedValue(false);
    await act(async () => {
      renderer = create(<BitcoinWalkChatsTab />);
      await settle();
    });

    expect(latestDestinationKeys()).toEqual(['city', 'guide', 'global']);
  });

  it('adds Hosts only after the relay confirms active membership', async () => {
    mockHasActiveMembership.mockResolvedValue(true);
    await act(async () => {
      renderer = create(<BitcoinWalkChatsTab />);
      await settle();
    });

    expect(latestDestinationKeys()).toEqual(['city', 'guide', 'global', 'hosts']);
    expect(mockDestroy).toHaveBeenCalled();
  });
});
