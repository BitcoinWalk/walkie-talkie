import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockDestination = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'global' };
const mockBuildSigner = jest.fn();
const mockEnsureMemberships = jest.fn();
const mockHasMembership = jest.fn();
const mockLoadCommunity = jest.fn();
const mockLoadMetadata = jest.fn();
const mockSubscribeCommunity = jest.fn();
const mockSelectCity = jest.fn();
const mockRouterPush = jest.fn();
let mockActivePubkey: string | null = 'a'.repeat(64);
const mockSelectedCity = {
  id: 'madeira',
  name: 'Madeira',
  slug: 'madeira',
  chat: { communities: { city: mockDestination, global: mockDestination } },
};

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
  useLocalSearchParams: () => ({ scope: 'global' }),
}));
jest.mock('lucide-react-native/icons/messages-square', () => () => null);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/common/ScreenHeader', () => ({
  ScreenHeader: () => null,
  useScreenHeaderClearance: () => 0,
}));
jest.mock('@/services/account/account.service', () => ({
  buildSigner: (...args: unknown[]) => mockBuildSigner(...args),
}));
jest.mock('@/services/bitcoinwalk/community-membership', () => ({
  ensureCommunityMemberships: (...args: unknown[]) => mockEnsureMemberships(...args),
  hasCommunityMembership: (...args: unknown[]) => mockHasMembership(...args),
}));
jest.mock('@/services/bitcoinwalk/community', () => ({
  loadCommunity: (...args: unknown[]) => mockLoadCommunity(...args),
  loadCommunityMetadata: (...args: unknown[]) => mockLoadMetadata(...args),
  mergeCommunityMessageModels: (_current: unknown[], incoming: unknown[]) => incoming,
  mergeCommunityMessages: (current: unknown[]) => current,
  sendCommunityMessage: jest.fn(),
  subscribeCommunity: (...args: unknown[]) => mockSubscribeCommunity(...args),
}));
jest.mock('@/services/bitcoinwalk/cities', () => ({ loadCities: jest.fn() }));
jest.mock('@/services/bitcoinwalk/chat-directory', () => ({
  loadBitcoinWalkChatDirectory: jest.fn(),
}));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { activePubkey: string | null }) => unknown) =>
    selector({ activePubkey: mockActivePubkey }),
}));
jest.mock('@/stores/selected-city.store', () => ({
  useSelectedCity: (selector: (state: {
    selectedCity: unknown;
    select: jest.Mock;
  }) => unknown) => selector({ selectedCity: mockSelectedCity, select: mockSelectCity }),
}));
jest.mock('@/stores/theme.store', () => ({
  useThemeStore: (selector: (state: { accent: 'blue'; preference: 'light' }) => unknown) =>
    selector({ accent: 'blue', preference: 'light' }),
}));

// Imports follow the hoisted Jest module factories above.
// eslint-disable-next-line import/first
import CommunityScreen from '@/app/(app)/community';
// eslint-disable-next-line import/first
import { AppButton } from '@/components/common/AppButton';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('BitcoinWalk community join screen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePubkey = 'a'.repeat(64);
    mockHasMembership.mockResolvedValue(false);
    mockLoadMetadata.mockResolvedValue({ name: 'BitcoinWalk Global', about: 'Everyone can join.' });
    mockLoadCommunity.mockResolvedValue({
      metadata: { name: 'BitcoinWalk Global', about: 'Everyone can join.' },
      roster: { memberPubkeys: [] },
      messages: [],
    });
    mockSubscribeCommunity.mockReturnValue(jest.fn());
    mockBuildSigner.mockResolvedValue({ destroy: jest.fn() });
    mockEnsureMemberships.mockResolvedValue({
      joined: [`${mockDestination.relay}\n${mockDestination.groupId}`],
      failed: [],
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders Join after loading public metadata without requesting restricted history', async () => {
    await act(async () => {
      renderer = create(<CommunityScreen />);
      await settle();
    });

    expect(mockLoadMetadata).toHaveBeenCalledWith(mockDestination, expect.any(AbortSignal));
    expect(mockLoadCommunity).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(AppButton).some(
      (button) => button.props.label === 'community.join',
    )).toBe(true);
  });

  it('loads authenticated history only after a successful explicit join', async () => {
    await act(async () => {
      renderer = create(<CommunityScreen />);
      await settle();
    });
    const join = renderer!.root.findAllByType(AppButton).find(
      (button) => button.props.label === 'community.join',
    );

    await act(async () => {
      await join!.props.onPress();
      await settle();
    });

    expect(mockEnsureMemberships).toHaveBeenCalledWith('a'.repeat(64), [mockDestination]);
    expect(mockBuildSigner).toHaveBeenCalledWith('a'.repeat(64));
    expect(mockLoadCommunity).toHaveBeenCalledWith(
      mockDestination,
      expect.any(AbortSignal),
      expect.anything(),
    );
  });

  it('opens Nostr sign-in instead of attempting a membership when signed out', async () => {
    mockActivePubkey = null;
    await act(async () => {
      renderer = create(<CommunityScreen />);
      await settle();
    });
    const signIn = renderer!.root.findAllByType(AppButton).find(
      (button) => button.props.label === 'community.sign_in',
    );

    await act(async () => {
      await signIn!.props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/welcome');
    expect(mockEnsureMemberships).not.toHaveBeenCalled();
  });
});
