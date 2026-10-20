import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';

import Contacts from '@/app/(app)/contacts';
import { ContactSectionList } from '@/components/contacts/ContactSectionList';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';

jest.mock('expo-router', () => ({router: {push: jest.fn()}, useIsFocused: () => true}));
jest.mock('@solar-icons/react-native/category/users/Linear/UserPlus', () => ({UserPlus: () => null}), {virtual: true});
jest.mock('@solar-icons/react-native/category/users/Linear/UsersGroupRounded', () => ({UsersGroupRounded: () => null}), {virtual: true});
jest.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, bottom: 24, left: 0, right: 0})}));
jest.mock('@/components/common/AppScreen', () => ({AppScreen: ({children}: {children: React.ReactNode}) => children}));
jest.mock('@/components/common/AppText', () => ({AppText: () => null}));
jest.mock('@/components/common/IconButton', () => ({IconButton: () => null}));
jest.mock('@/components/common/IdentityListItem', () => ({IdentityListItem: () => null}));
jest.mock('@/components/common/NotificationDot', () => ({NotificationDot: () => null}));
jest.mock('@/components/common/ScreenHeader', () => ({ScreenHeader: ({right}: {right: React.ReactNode}) => right}));
jest.mock('@/components/search/SearchTransition', () => ({SearchTransition: ({children}: {children: React.ReactNode}) => children}));
jest.mock('@/components/search/SearchBar', () => ({SearchBar: () => null, SEARCH_BAR_SCREEN_GUTTER: 16}));
jest.mock('@/components/conversation/ContactListItem', () => ({ContactListItem: () => null}));
jest.mock('@/components/contacts/ContactSectionList', () => ({ContactSectionList: () => null}));
jest.mock('@/hooks/use-contact-entries', () => ({useContactEntries: () => ({entries: [{pubkey: 'contact'}], loaded: true})}));
jest.mock('@/hooks/use-conversations', () => ({useUnreadRequestCount: () => 1}));
jest.mock('@/hooks/use-scrolled', () => ({useScrolled: () => ({scrolled: false, scrollProps: {}})}));
jest.mock('@/services/relay/personal-configs.service', () => ({syncPersonalConfigs: jest.fn(async () => {})}));
jest.mock('@/stores/active-account.store', () => ({useActiveAccount: (select: (state: {activePubkey: string}) => unknown) => select({activePubkey: 'account'})}));
jest.mock('@/stores/theme.store', () => ({useThemeStore: (select: (state: {accent: string; preference: string}) => unknown) => select({accent: 'blue', preference: 'light'})}));

describe('contacts inside Chat, not a bottom tab', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer?.unmount()));

  it('mounts as a pushed screen without depending on the tabs provider', async () => {
    await act(async () => {renderer = create(<Contacts />);});
    expect(renderer.root.findByType(ScreenHeader).props.back).not.toBe(false);
    expect(renderer.root.findByType(ContactSectionList).props.entries).toEqual([{pubkey: 'contact'}]);
    act(() => {renderer.root.findByType(ContactSectionList).props.onSelect('contact');});
    expect(router.push).toHaveBeenLastCalledWith('/chat/contact');
    act(() => {renderer.root.findByType(IconButton).props.onPress();});
    expect(router.push).toHaveBeenLastCalledWith('/add-contact');
  });
});
