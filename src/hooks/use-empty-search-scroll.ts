import { type RefObject, useEffect } from 'react';

/** Dismisses empty desktop search when the underlying list scrolls. */
export function useEmptySearchScroll(
  surface: RefObject<unknown>,
  enabled: boolean,
  onCancel: () => void,
) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const node = surface.current as HTMLElement | null;
    if (!node?.addEventListener) return;
    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      onCancel();
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && event.deltaY !== 0) cancel();
    };
    // RN Web does not emit native drag callbacks. Capture descendant scrolls
    // as well as wheel input, including scrollbar and keyboard scrolling.
    node.addEventListener('wheel', wheel, { passive: true });
    node.addEventListener('scroll', cancel, true);
    return () => {
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('scroll', cancel, true);
    };
  }, [enabled, surface, onCancel]);
}
