import { toastPaneInsets } from '../toast-pane-position';

it('centres each toast within its column instead of the whole window', () => {
  expect(toastPaneInsets('primary', 1000, 320)).toEqual({ left: 0, right: 680 });
  expect(toastPaneInsets('detail', 1000, 320)).toEqual({ left: 320, right: 0 });
});

it('follows a resized divider and mirrors columns for RTL', () => {
  expect(toastPaneInsets('primary', 1000, 460)).toEqual({ left: 0, right: 540 });
  expect(toastPaneInsets('detail', 1000, 460)).toEqual({ left: 460, right: 0 });
  expect(toastPaneInsets('primary', 1000, 460, true)).toEqual({ left: 540, right: 0 });
  expect(toastPaneInsets('detail', 1000, 460, true)).toEqual({ left: 0, right: 460 });
});

it('uses the whole window without a target or an active split navigator', () => {
  expect(toastPaneInsets(null, 1000, 320)).toEqual({ left: 0, right: 0 });
  expect(toastPaneInsets('detail', 400, null)).toEqual({ left: 0, right: 0 });
  expect(toastPaneInsets('primary', 400, 460)).toEqual({ left: 0, right: 0 });
});
