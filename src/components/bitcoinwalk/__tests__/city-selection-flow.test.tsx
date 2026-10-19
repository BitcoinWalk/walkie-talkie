import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockCity = {
  id: 'madeira', name: 'Madeira', slug: 'madeira', aliases: [],
  canonicalUrl: 'https://bitcoinwalk.org/madeira',
  avatarUrl: 'https://bitcoinwalk.org/brand/bitcoinwalk-share-fallback.jpg',
  chat: { scope: 'city', url: null, nip29: null, communities: { city: null, global: null } },
};
const mockLoadCities = jest.fn();
const mockSelectCity = jest.fn();
const mockSelectCommunity = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockOpenExternalUrl = jest.fn();
let mockActivePubkey: string | null = null;

jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args) },
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/common/ScreenHeader', () => ({
  ScreenHeader: () => null,
  useScreenHeaderClearance: () => 0,
}));
jest.mock('@/platform', () => ({
  platform: { urlOpener: { openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args) } },
}));
jest.mock('@/services/bitcoinwalk/cities', () => ({
  loadCities: (...args: unknown[]) => mockLoadCities(...args),
}));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { activePubkey: string | null }) => unknown) =>
    selector({ activePubkey: mockActivePubkey }),
}));
jest.mock('@/stores/bitcoinwalk-community.store', () => ({
  useBitcoinWalkCommunity: (selector: (state: { select: jest.Mock }) => unknown) =>
    selector({ select: mockSelectCommunity }),
}));
jest.mock('@/stores/selected-city.store', () => ({
  useSelectedCity: (selector: (state: { select: jest.Mock }) => unknown) =>
    selector({ select: mockSelectCity }),
}));
jest.mock('@/stores/theme.store', () => ({
  useThemeStore: (selector: (state: { accent: 'orange'; preference: 'light' }) => unknown) =>
    selector({ accent: 'orange', preference: 'light' }),
}));

// Imports follow the hoisted Jest module factories above.
// eslint-disable-next-line import/first
import ChooseCity from '@/app/(onboarding)/city';
// eslint-disable-next-line import/first
import { AppButton } from '@/components/common/AppButton';

async function renderCityScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ChooseCity />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await Promise.resolve();
  });
  return renderer;
}

describe('anonymous city selection flow', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivePubkey = null;
    mockLoadCities.mockResolvedValue([mockCity]);
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('stores the city, preselects its chat, then opens Nostr sign-in', async () => {
    renderer = await renderCityScreen();
    const cityChoice = renderer.root.findAll(
      (node) => node.props.accessibilityLabel === 'city_select.choose',
    )[0];

    act(() => { void cityChoice.props.onPress(); });

    expect(mockSelectCity).toHaveBeenCalledWith(mockCity);
    expect(mockSelectCommunity).toHaveBeenCalledWith('city');
    expect(mockPush).toHaveBeenCalledWith('/welcome');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens the existing walk-creation flow when the city is missing', async () => {
    renderer = await renderCityScreen();
    const addCity = renderer.root.findAllByType(AppButton)
      .find((button) => button.props.label === 'city_select.add_city');

    act(() => { void addCity!.props.onPress(); });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://bitcoinwalk.org/start');
  });
});
