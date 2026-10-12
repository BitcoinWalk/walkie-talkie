import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { setRenderedPrimaryPaneWidth } from '@/stores/pane-layout.store';
import { showToast, useToastStore } from '@/stores/toast.store';
import { Toast } from '../Toast';

let mockWidth = 1000;
let mockRTL = false;
let mockDark = false;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800 }),
}));
jest.mock('@/i18n/direction', () => ({ useIsRTL: () => mockRTL }));
jest.mock('@/theme', () => ({
  contentWidth: { toast: 480 }, radius: { full: 999 }, spacing: { sm: 8 },
  useThemeColors: () => ({
    surfaceElevated: mockDark ? 'dark-surface' : 'light-surface', border: 'border',
  }),
}));
jest.mock('../AppText', () => ({ AppText: 'AppText' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: 'AnimatedView' },
    cancelAnimation: jest.fn(), Easing: { out: (value: unknown) => value, cubic: 'cubic' },
    ReduceMotion: { System: 'system' },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withTiming: (value: number) => value,
  };
});

it('positions root and modal hosts together through resize, RTL, narrow layout and both themes', () => {
  jest.useFakeTimers();
  setRenderedPrimaryPaneWidth(320);
  showToast('Saved', { target: 'detail' });
  let renderer!: ReactTestRenderer;
  const hosts = <><Toast /><Toast managesLifetime={false} /></>;
  act(() => { renderer = create(hosts); });
  const styles = () => renderer.root.findAllByType('AnimatedView' as never)
    .map((host) => StyleSheet.flatten(host.props.style));
  const surfaces = () => renderer.root.findAll((node) => (
    node.props?.style?.backgroundColor === (mockDark ? 'dark-surface' : 'light-surface')
  ));
  expect(surfaces().length).toBeGreaterThanOrEqual(2);
  expect(styles()).toEqual([
    expect.objectContaining({ left: 320, right: 0 }),
    expect.objectContaining({ left: 320, right: 0 }),
  ]);
  act(() => { setRenderedPrimaryPaneWidth(460); });
  expect(styles()[0].left).toBe(460);
  mockRTL = true;
  mockDark = true;
  act(() => { showToast('Saved', { target: 'primary' }); });
  expect(surfaces().length).toBeGreaterThanOrEqual(2);
  expect(styles()[0]).toMatchObject({ left: 540, right: 0 });
  mockWidth = 400;
  act(() => { showToast('Saved', { target: 'detail' }); });
  expect(styles()[0]).toMatchObject({ left: 0, right: 0 });
  mockWidth = 1000;
  act(() => { showToast('Global'); });
  expect(styles()[0]).toMatchObject({ left: 0, right: 0 });
  act(() => { renderer.unmount(); });
  setRenderedPrimaryPaneWidth(null);
  useToastStore.getState().hide();
  jest.useRealTimers();
});
