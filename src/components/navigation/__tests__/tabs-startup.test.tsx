import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockActivePubkey: string | null = null;
let mockProcessedScreens: { name: string; options: Record<string, unknown> }[] = [];

// Exercise Expo's actual href/button processing against the app's tab layout.
jest.mock('expo-router/build/layouts/withLayoutContext', () => ({
  withLayoutContext: (_navigator: unknown, process: (screens: unknown[]) => typeof mockProcessedScreens) => {
    const { Children } = jest.requireActual<typeof import('react')>('react');
    const Navigator = ({ children }: { children: React.ReactNode }) => {
      mockProcessedScreens = process(Children.toArray(children).map((child) => (child as ReactElement).props));
      return null;
    };
    Navigator.Screen = function Screen() { return null; };
    return Navigator;
  },
}));
jest.mock('expo-router/build/react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null }),
}));
jest.mock('expo-router/build/link/Link', () => ({ Link: () => null }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Tabs: jest.requireActual('expo-router/build/layouts/TabsClient').default,
}));
jest.mock('expo-router/build/react-navigation/elements', () => ({ PlatformPressable: () => null }));
jest.mock('lucide-react-native/icons/map-pin', () => () => null);
jest.mock('@solar-icons/react-native/category/messages/Bold/ChatRound', () => ({ ChatRound: () => null }), { virtual: true });
jest.mock('@solar-icons/react-native/category/messages/Linear/ChatRound', () => ({ ChatRound: () => null }), { virtual: true });
jest.mock('@solar-icons/react-native/category/users/Bold/UserCircle', () => ({ UserCircle: () => null }), { virtual: true });
jest.mock('@solar-icons/react-native/category/users/Linear/UserCircle', () => ({ UserCircle: () => null }), { virtual: true });
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/account/AccountSwitcherSheet', () => ({ AccountSwitcherSheet: () => null }));
jest.mock('@/components/account/AccountTabIcon', () => ({ AccountTabIcon: () => null }));
jest.mock('@/components/common/ChromeBackdrop', () => ({ ChromeBackdrop: () => null }));
jest.mock('@/components/navigation/tab-icon-with-badge', () => ({ TabIconWithBadge: () => null }));
jest.mock('@/components/navigation/primary-pane-navigation', () => ({
  PrimaryPaneNavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/hooks/use-conversations', () => ({ useTotalUnread: () => 0, useUnreadRequestCount: () => 0 }));
jest.mock('@/i18n/direction', () => ({ useIsRTL: () => false }));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (select: (state: { activePubkey: string | null }) => unknown) =>
    select({ activePubkey: mockActivePubkey }),
}));
jest.mock('@/stores/screenshot-preview.store', () => ({
  useScreenshotPreviewStore: (select: (state: { enabled: boolean; readUnreadCount: number }) => unknown) =>
    select({ enabled: false, readUnreadCount: 0 }),
}));
jest.mock('@/theme', () => ({
  bottomBarHeight: 48,
  fontWeight: { medium: '500' },
  spacing: { xs: 4, sm: 8 },
  typography: { micro: { fontSize: 12 } },
  uiDensity: { tabIconSize: 24 },
  useThemeColors: () => ({}),
}));

// eslint-disable-next-line import/first
import TabsLayout from '@/app/(app)/(tabs)/_layout';

describe('tab startup configuration', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockActivePubkey = null;
  });

  it('opens before account hydration, then enables account controls after restoration', () => {
    expect(() => act(() => { renderer = create(<TabsLayout />); })).not.toThrow();
    const hiddenAccount = mockProcessedScreens.find((screen) => screen.name === 'me')!;
    expect(hiddenAccount.options.tabBarItemStyle).toEqual({ display: 'none' });

    mockActivePubkey = 'a'.repeat(64);
    act(() => renderer!.update(<TabsLayout />));
    expect(mockProcessedScreens.map((screen) => screen.name)).toEqual(['walks', 'index', 'me']);
    const restoredAccount = mockProcessedScreens.find((screen) => screen.name === 'me')!;
    expect(restoredAccount.options.href).toBeUndefined();
    expect(restoredAccount.options.tabBarItemStyle).toBeUndefined();
    expect(restoredAccount.options.tabBarButton).toEqual(expect.any(Function));

    mockActivePubkey = null;
    act(() => renderer!.update(<TabsLayout />));
    expect(mockProcessedScreens.find((screen) => screen.name === 'me')!.options.tabBarItemStyle)
      .toEqual({ display: 'none' });
  });
});
