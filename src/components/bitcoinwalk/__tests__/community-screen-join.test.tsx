import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ActivityIndicator, FlatList } from 'react-native';

const mockDestination = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'global' };
const mockBuildSigner = jest.fn();
const mockEnsureMemberships = jest.fn();
const mockHasMembership = jest.fn();
const mockLoadCommunity = jest.fn();
const mockSubscribeCommunity = jest.fn();
const mockActiveMembership = jest.fn();
const mockLoadDirectory = jest.fn();
const mockLoadCities = jest.fn();
const mockSelectCity = jest.fn();
const mockRouterPush = jest.fn();
let mockParams: {scope?: string; city?: string} = {scope: 'global'};
let mockActivePubkey: string | null = 'a'.repeat(64);
const mockSelectedCity = {
  id: 'madeira',
  name: 'Madeira',
  slug: 'madeira',
  chat: { communities: { city: mockDestination, global: mockDestination } },
};

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('lucide-react-native/icons/messages-square', () => () => null);
jest.mock('lucide-react-native/icons/send', () => () => null);
jest.mock('@/components/bitcoinwalk/CommunityComposer', () => ({ CommunityComposer: () => null }));
jest.mock('@/components/chat/BubbleBody', () => ({ BubbleBody: () => null }));
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
  hasActiveCommunityMembership: (...args: unknown[]) => mockActiveMembership(...args),
  loadCommunity: (...args: unknown[]) => mockLoadCommunity(...args),
  mergeCommunityMessageModels: (_current: unknown[], incoming: unknown[]) => incoming,
  mergeCommunityMessages: (current: unknown[]) => current,
  sendCommunityMessage: jest.fn(),
  subscribeCommunity: (...args: unknown[]) => mockSubscribeCommunity(...args),
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('@/services/bitcoinwalk/cities', () => ({ loadCities: (...args: unknown[]) => mockLoadCities(...args) }));
jest.mock('@/services/bitcoinwalk/chat-directory', () => ({
  loadBitcoinWalkChatDirectory: (...args: unknown[]) => mockLoadDirectory(...args),
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
import CommunityScreen, { communityTimelineAtTail } from '@/app/(app)/community';
// eslint-disable-next-line import/first
import { AppButton } from '@/components/common/AppButton';
// eslint-disable-next-line import/first
import { getBottomChromeInset } from '@/lib/layout/bottom-chrome';
// eslint-disable-next-line import/first
import { bottomBarHeight, spacing } from '@/theme';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('BitcoinWalk community join screen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePubkey = 'a'.repeat(64);
    mockParams = {scope: 'global'};
    mockHasMembership.mockResolvedValue(false);
    mockLoadDirectory.mockResolvedValue({communities: {global: mockDestination}});
    mockActiveMembership.mockResolvedValue(false);
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
      failureReasons: {},
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders public history before joining without publishing a join', async () => {
    await act(async () => {
      renderer = create(<CommunityScreen />);
      await settle();
    });

    expect(mockLoadCommunity).toHaveBeenCalledWith(
      mockDestination,
      expect.any(AbortSignal),
      undefined,
    );
    expect(mockEnsureMemberships).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(AppButton).some(
      (button) => button.props.label === 'community.join',
    )).toBe(true);
  });

  it('shows progress while a community history is loading', async () => {
    mockLoadCommunity.mockReturnValue(new Promise(() => {}));

    await act(async () => { renderer = create(<CommunityScreen />); });

    expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('keeps the composer clear of messages and tracks whether the reader is at the tail', async () => {
    mockActiveMembership.mockResolvedValue(true);
    await act(async () => { renderer = create(<CommunityScreen />); await settle(); });

    const list = renderer!.root.findByType(FlatList);
    expect(list.props.contentContainerStyle.paddingBottom).toBeUndefined();
    expect(list.props.ListFooterComponent.props.style.height).toBe(
      bottomBarHeight + getBottomChromeInset(0) + spacing.lg,
    );
    expect(list.props.onLayout).toEqual(expect.any(Function));
    expect(list.props.onContentSizeChange).toEqual(expect.any(Function));
    expect(communityTimelineAtTail({
      contentOffset: { x: 0, y: 460 },
      contentSize: { width: 320, height: 1_000 },
      layoutMeasurement: { width: 320, height: 500 },
      contentInset: { top: 0, right: 0, bottom: 0, left: 0 },
      velocity: undefined,
      targetContentOffset: undefined,
      zoomScale: 1,
    })).toBe(true);
    expect(communityTimelineAtTail({
      contentOffset: { x: 0, y: 200 },
      contentSize: { width: 320, height: 1_000 },
      layoutMeasurement: { width: 320, height: 500 },
      contentInset: { top: 0, right: 0, bottom: 0, left: 0 },
      velocity: undefined,
      targetContentOffset: undefined,
      zoomScale: 1,
    })).toBe(false);
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

  it('opens an already joined group from another device without asking to join again', async () => {
    mockActiveMembership.mockResolvedValue(true);
    await act(async () => { renderer = create(<CommunityScreen />); await settle(); });
    expect(mockLoadCommunity).toHaveBeenCalledWith(mockDestination, expect.any(AbortSignal), expect.anything());
    expect(mockEnsureMemberships).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(AppButton).some((button) => button.props.label === 'community.join')).toBe(false);
  });

  it('browses another joined city without replacing the walking city', async () => {
    mockParams = {scope: 'city', city: 'london'};
    mockLoadCities.mockResolvedValue([{...mockSelectedCity, id: 'london', slug: 'london', name: 'London'}]);
    mockActiveMembership.mockResolvedValue(true);
    await act(async () => { renderer = create(<CommunityScreen />); await settle(); });
    expect(mockSelectCity).not.toHaveBeenCalled();
    expect(mockLoadCommunity).toHaveBeenCalledWith(mockDestination, expect.any(AbortSignal), expect.anything());
  });
});
