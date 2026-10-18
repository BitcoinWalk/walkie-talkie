import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  BitcoinWalkChatRail,
  type BitcoinWalkChatDestination,
} from '../BitcoinWalkChatRail';
import { InteractivePressable } from '@/components/common/InteractivePressable';

jest.mock('@/i18n/direction', () => ({
  getLanguageDirection: () => 'ltr',
  useLanguageDirection: () => 'ltr',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));
jest.mock('@/stores/theme.store', () => ({
  useThemeStore: (selector: (state: { accent: 'blue'; preference: 'light' }) => unknown) =>
    selector({ accent: 'blue', preference: 'light' }),
}));

const destinations: BitcoinWalkChatDestination[] = [
  { key: 'city', title: 'City', subtitle: 'Madeira', available: true, onPress: jest.fn() },
  { key: 'guide', title: 'Guide', subtitle: 'Private DM', available: true, onPress: jest.fn() },
  { key: 'global', title: 'Global', subtitle: 'Public chat', available: true, onPress: jest.fn() },
  { key: 'hosts', title: 'Hosts', subtitle: 'Private group', available: false, onPress: jest.fn() },
];

describe('BitcoinWalk chat rail', () => {
  it('keeps the four product chats in their intended order and exposes access state', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<BitcoinWalkChatRail label="BitcoinWalk" destinations={destinations} />);
    });
    const buttons = tree!.root.findAllByType(InteractivePressable);
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
      'City, Madeira',
      'Guide, Private DM',
      'Global, Public chat',
      'Hosts, Private group',
    ]);
    expect(buttons.map((button) => button.props.accessibilityState.disabled)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});
