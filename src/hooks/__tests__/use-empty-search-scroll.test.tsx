import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useEmptySearchScroll } from '../use-empty-search-scroll';

it('dismisses empty desktop search on wheel or scroll and cleans up for results', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  const listeners = new Map<string, (event: unknown) => void>();
  const surface = { current: {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string) => listeners.delete(type),
  } };
  const cancel = jest.fn();
  let renderer: ReactTestRenderer | undefined;
  function Harness({ enabled }: { enabled: boolean }) {
    useEmptySearchScroll(surface, enabled, cancel);
    return null;
  }

  try {
    act(() => { renderer = create(<Harness enabled />); });
    expect(listeners.has('wheel')).toBe(true);
    expect(listeners.has('scroll')).toBe(true);
    act(() => listeners.get('wheel')?.({ ctrlKey: true, deltaY: 20 }));
    act(() => listeners.get('wheel')?.({ ctrlKey: false, deltaY: 0 }));
    expect(cancel).not.toHaveBeenCalled();
    act(() => {
      listeners.get('wheel')?.({ ctrlKey: false, deltaY: 20 });
      listeners.get('scroll')?.({});
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    act(() => renderer!.update(<Harness enabled={false} />));
    expect(listeners.size).toBe(0);
    act(() => renderer!.update(<Harness enabled />));
    act(() => listeners.get('scroll')?.({}));
    expect(cancel).toHaveBeenCalledTimes(2);
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(listeners.size).toBe(0);
  } finally {
    act(() => renderer?.unmount());
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
