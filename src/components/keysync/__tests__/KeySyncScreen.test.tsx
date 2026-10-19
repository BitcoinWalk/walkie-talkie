import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockContinue = jest.fn(async () => {});
const mockButton = jest.fn((_props: unknown) => null);

jest.mock('@solar-icons/react-native/category/messages/Linear/ChatRoundDots', () => ({
  ChatRoundDots: () => null,
}), { virtual: true });
jest.mock('@/components/common/AppButton', () => ({
  AppButton: (props: unknown) => mockButton(props),
}));
jest.mock('@/components/common/AppContentColumn', () => ({
  AppContentColumn: ({ children }: { children?: React.ReactNode }) => {
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/components/common/AppScreen', () => ({
  AppScreen: ({ children }: { children?: React.ReactNode }) => {
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/components/common/AppText', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => {
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { continueWithoutDmSync: () => Promise<void> }) => unknown) =>
    selector({ continueWithoutDmSync: mockContinue }),
}));
jest.mock('@/theme', () => ({
  spacing: { sm: 8, lg: 16, xl: 24 },
  useThemeColors: () => ({ accent: '#ff9416' }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { KeySyncScreen } = jest.requireActual<typeof import('../KeySyncScreen')>('../KeySyncScreen');

it('offers one safe path into BitcoinWalk without a DM-key reset', async () => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<KeySyncScreen />);
  });

  const props = mockButton.mock.lastCall?.[0] as { label: string; onPress: () => void };
  expect(props.label).toBe('key_sync.continue_action');
  expect(JSON.stringify(renderer?.toJSON())).not.toContain('reset_action');
  expect(JSON.stringify(renderer?.toJSON())).not.toContain('pairing_code');

  await act(async () => {
    props.onPress();
    await Promise.resolve();
  });
  expect(mockContinue).toHaveBeenCalledTimes(1);

  act(() => renderer?.unmount());
});
