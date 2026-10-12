import { create } from 'zustand';

/** Actual rendered split geometry, including divider drags. Null means the
 * split navigator is absent; this is transient and never persisted. */
export const usePaneLayoutStore = create<{ primaryWidth: number | null }>(() => ({
  primaryWidth: null,
}));

export function setRenderedPrimaryPaneWidth(primaryWidth: number | null) {
  if (usePaneLayoutStore.getState().primaryWidth === primaryWidth) return;
  usePaneLayoutStore.setState({ primaryWidth });
}
