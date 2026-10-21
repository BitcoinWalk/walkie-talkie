import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ActivityIndicator, FlatList } from 'react-native';

import BitcoinWalkChatsTab from '@/app/(app)/(tabs)/index';
import { BitcoinWalkCommunityRow } from '@/components/bitcoinwalk/BitcoinWalkCommunityRow';
import { NearbyRoomRow } from '@/components/bitcoinwalk/NearbyRoomRow';
import { ConversationListItem } from '@/components/conversation/ConversationListItem';
import { IconButton } from '@/components/common/IconButton';
import { communityMembershipChanged } from '@/services/bitcoinwalk/membership-events';

const mockLoad = jest.fn();
const mockOpen = jest.fn();
type MockCityPickerProps = {
  visible: boolean;
  selectedSlug: string | null;
  onSelect: (city: {slug: string}) => void;
};
const mockCityPicker = jest.fn((_props: MockCityPickerProps) => null);
let mockAccount = 'a'.repeat(64);
let mockTheme: 'light' | 'dark' = 'light';
let mockWalkCity: {id: string; slug: string} | null = {id: 'madeira', slug: 'madeira'};
let mockChatCity: string | null = null;
let mockChatCityLoaded = true;
const mockSelectChatCity = jest.fn((slug: string | null) => { mockChatCity = slug; });
const mockGuide = 'b'.repeat(64);
const mockDm = 'c'.repeat(64);
const mockDirectory = {
  guidePubkey: mockGuide,
  communities: { global: { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'global' } },
};
const mockConversation = (key: string, groupId: string | null = null) => ({
  conversation: { accountPubkey: mockAccount, conversationKey: key, groupId, name: key,
    updatedAt: 100, unreadCount: 1, muted: false, deliveryKind: 'relay' },
  lastMessageContent: 'hello', lastMessageKind: 14, lastMessageTags: null,
});
let mockConversations: ReturnType<typeof mockConversation>[] = [];

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) => jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('lucide-react-native/icons/plus', () => () => null);
jest.mock('lucide-react-native/icons/chevron-down', () => () => null);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: {city: string}) => values?.city ?? key }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 24, left: 0 }) }));
jest.mock('@/components/common/AppScreen', () => ({ AppScreen: ({children}: {children: React.ReactNode}) => children }));
jest.mock('@/components/common/ScreenHeader', () => ({ ScreenHeader: ({right}: {right: React.ReactNode}) => right }));
jest.mock('@/components/common/IconButton', () => ({ IconButton: () => null }));
jest.mock('@/components/common/NotificationDot', () => ({ NotificationDot: () => null }));
jest.mock('@/components/common/AppButton', () => ({ AppButton: () => null }));
jest.mock('@/components/common/AppText', () => ({ AppText: () => null }));
jest.mock('@/components/bitcoinwalk/BitcoinWalkCommunityRow', () => ({ BitcoinWalkCommunityRow: () => null }));
jest.mock('@/components/bitcoinwalk/NearbyRoomRow', () => ({ NearbyRoomRow: () => null }));
jest.mock('@/components/bitcoinwalk/BitcoinWalkCityPickerSheet', () => ({
  BitcoinWalkCityPickerSheet: (props: MockCityPickerProps) => mockCityPicker(props),
}));
jest.mock('@/components/conversation/ConversationListItem', () => ({ ConversationListItem: () => null }));
jest.mock('@/components/navigation/primary-pane-navigation', () => ({ usePrimaryPaneNavigation: () => ({open: mockOpen, selection: {}, wide: false}) }));
jest.mock('@/hooks/use-conversations', () => ({
  useMainInboxConversations: () => ({conversations: mockConversations, loaded: true}),
  useRequestConversations: () => ({conversations: [], loaded: true}),
  useUnreadRequestCount: () => 0,
}));
jest.mock('@/hooks/use-scrolled', () => ({ useScrolled: () => ({scrolled: false, scrollProps: {}}) }));
jest.mock('@/services/bitcoinwalk/chat-inbox', () => ({ loadBitcoinWalkInbox: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/services/conversation/conversation-prefs.service', () => ({ setConversationMuted: jest.fn(), setConversationPinned: jest.fn() }));
jest.mock('@/services/dm/dm.service', () => ({ dmService: { deleteConversation: jest.fn() } }));
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }));
jest.mock('@/stores/unread-count.store', () => ({ useUnreadIndicatorsEnabled: () => true }));
jest.mock('@/stores/active-account.store', () => ({ useActiveAccount: (select: (state: {activePubkey: string}) => unknown) => select({activePubkey: mockAccount}) }));
jest.mock('@/stores/selected-city.store', () => ({ useSelectedCity: (select: (state: {selectedCity: unknown}) => unknown) => select({selectedCity: mockWalkCity}) }));
jest.mock('@/stores/chat-city.store', () => ({ useChatCity: (select: (state: {
  preferredSlug: string | null; loaded: boolean; load: () => Promise<void>; select: (slug: string | null) => void;
}) => unknown) => select({preferredSlug: mockChatCity, loaded: mockChatCityLoaded,
  load: jest.fn(async () => {}), select: mockSelectChatCity}) }));
jest.mock('@/stores/theme.store', () => ({ useThemeStore: (select: (state: {accent: string; preference: string}) => unknown) => select({accent: 'blue', preference: mockTheme}) }));

describe('unified native Chat inbox', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount = 'a'.repeat(64);
    mockWalkCity = {id: 'madeira', slug: 'madeira'};
    mockChatCity = null;
    mockChatCityLoaded = true;
    mockConversations = [mockConversation(mockDm), mockConversation(mockGuide), mockConversation('group:test', 'test')];
    mockLoad.mockResolvedValue({directory: mockDirectory,
      cities: [{id: 'madeira', slug: 'madeira', name: 'Madeira', avatarUrl: 'city.png'}], hosts: false});
  });
  afterEach(() => act(() => renderer?.unmount()));

  it('pins Nearby first even without login or a loaded directory', async () => {
    mockAccount = '';
    mockConversations = [];
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    const nearby = renderer.root.findByType(NearbyRoomRow);
    expect(mockLoad).not.toHaveBeenCalled();
    await act(async () => { nearby.props.onPress(); });
    expect(mockOpen).toHaveBeenCalledWith('/nearby-room');
    const list = renderer.root.findByType(FlatList);
    expect(list.props.data[0]).toEqual({ kind: 'nearby', key: 'nearby' });
  });

  it.each(['light', 'dark'] as const)('uses the Walk city as the single city row in %s', async (theme) => {
    mockTheme = theme;
    mockLoad.mockResolvedValue({directory: mockDirectory,
      cities: [
        {id: 'augsburg', slug: 'augsburg', name: 'Augsburg', avatarUrl: 'augsburg.png'},
        {id: 'madeira', slug: 'madeira', name: 'Madeira', avatarUrl: 'madeira.png'},
      ], hosts: false});
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    const rows = renderer.root.findAllByType(BitcoinWalkCommunityRow);
    expect(rows.map((row) => row.props.title)).toEqual(['community.guide_full_title', 'community.global_title', 'Madeira']);
    expect(renderer.root.findAllByType(ConversationListItem).map((row) => row.props.conversationKey)).toEqual(['group:test', mockDm]);
    act(() => { rows[0].props.onPress(); });
    expect(mockOpen).toHaveBeenLastCalledWith(expect.stringContaining(`/${mockGuide}?mode=guide`));
    act(() => { rows[2].props.onPress(); });
    expect(mockOpen).toHaveBeenLastCalledWith('/community?scope=city&city=madeira');

    act(() => { rows[2].props.trailing.props.onPress(); });
    expect(mockCityPicker.mock.lastCall?.[0]).toMatchObject({ visible: true, selectedSlug: 'madeira' });
  });

  it('remembers a chat-only city without changing the Walk city', async () => {
    mockChatCity = 'augsburg';
    mockLoad.mockResolvedValue({directory: mockDirectory,
      cities: [
        {id: 'augsburg', slug: 'augsburg', name: 'Augsburg', avatarUrl: 'augsburg.png'},
        {id: 'madeira', slug: 'madeira', name: 'Madeira', avatarUrl: 'madeira.png'},
      ], hosts: false});

    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });

    const rows = renderer.root.findAllByType(BitcoinWalkCommunityRow);
    expect(rows.map((row) => row.props.title)).toEqual([
      'community.guide_full_title', 'community.global_title', 'Augsburg',
    ]);
    act(() => { mockCityPicker.mock.lastCall?.[0].onSelect({slug: 'madeira'}); });
    expect(mockSelectChatCity).toHaveBeenCalledWith('madeira');
    expect(mockWalkCity).toEqual({id: 'madeira', slug: 'madeira'});
  });

  it('keeps verified Hosts and exposes contacts from the single add action', async () => {
    mockLoad.mockResolvedValue({directory: mockDirectory,
      cities: [{id: 'madeira', slug: 'madeira', name: 'Madeira', avatarUrl: 'city.png'}], hosts: true});
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    expect(renderer.root.findAllByType(BitcoinWalkCommunityRow).map((row) => row.props.title))
      .toEqual(['community.guide_full_title', 'community.global_title', 'Madeira', 'community.hosts_full_title']);
    act(() => { renderer.root.findByType(IconButton).props.onPress(); });
    expect(mockOpen).toHaveBeenLastCalledWith('/contacts');
  });

  it('does not leak old account community rows while the new account loads', async () => {
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    mockAccount = 'd'.repeat(64);
    mockLoad.mockReturnValue(new Promise(() => {}));
    await act(async () => { renderer.update(<BitcoinWalkChatsTab />); });
    expect(renderer.root.findAllByType(BitcoinWalkCommunityRow)).toHaveLength(0);
    expect(renderer.root.findAllByType(ConversationListItem)).toHaveLength(0);
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('shows progress while the initial community inbox is loading', async () => {
    mockConversations = [];
    mockLoad.mockReturnValue(new Promise(() => {}));

    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });

    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('keeps private conversations available if membership refresh fails', async () => {
    mockLoad.mockRejectedValue(new Error('offline'));
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    expect(renderer.root.findAllByType(ConversationListItem).length).toBeGreaterThan(0);
  });

  it('refreshes after a local join, but ignores another account’s membership changes', async () => {
    await act(async () => { renderer = create(<BitcoinWalkChatsTab />); });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    await act(async () => { communityMembershipChanged('other-account'); });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    await act(async () => { communityMembershipChanged(mockAccount); });
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });
});
