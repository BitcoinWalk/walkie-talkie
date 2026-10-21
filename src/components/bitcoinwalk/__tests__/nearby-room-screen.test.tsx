import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import NearbyRoomScreen from '@/app/(app)/nearby-room';
import { AppText } from '@/components/common/AppText';

let mockTheme = 'light';

jest.mock('lucide-react-native/icons/bluetooth', () => () => null);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/common/AppScreen', () => ({ AppScreen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/common/ScreenHeader', () => ({ ScreenHeader: () => null, useScreenHeaderClearance: () => 80 }));
jest.mock('@/components/common/AppText', () => ({ AppText: () => null }));
jest.mock('@/stores/theme.store', () => ({ useThemeStore: (select: (s: { accent: string; preference: string }) => unknown) => select({ accent: 'blue', preference: mockTheme }) }));

describe('parked Nearby screen', () => {
  let renderer: ReactTestRenderer;
  const texts = () => renderer.root.findAllByType(AppText).map((node) => node.props.children);
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => act(() => renderer?.unmount()));

  it.each(['light', 'dark'])('shows a static coming-soon placeholder in %s', async (theme) => {
    mockTheme = theme;
    await act(async () => { renderer = create(<NearbyRoomScreen />); });
    expect(texts()).toContain('nearby_room.coming_soon_title');
    expect(texts()).toContain('nearby_room.coming_soon_description');
  });
});
