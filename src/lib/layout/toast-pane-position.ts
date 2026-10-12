import type { ToastTarget } from '@/stores/toast.store';

/** Resolve logical columns using the app direction, including in-place
 * language switches where RN Web's native direction can be stale. */
export function toastPaneInsets(
  target: ToastTarget | null,
  windowWidth: number,
  primaryWidth: number | null,
  isRTL = false,
): { left: number; right: number } {
  if (!target || primaryWidth === null || primaryWidth <= 0 || primaryWidth >= windowWidth) {
    return { left: 0, right: 0 };
  }
  const start = target === 'primary' ? 0 : primaryWidth;
  const end = target === 'primary' ? windowWidth - primaryWidth : 0;
  return isRTL ? { left: end, right: start } : { left: start, right: end };
}
