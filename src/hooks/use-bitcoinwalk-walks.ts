import { useCallback, useEffect, useRef, useState } from 'react';

import { loadWalks, type Walk } from '@/services/bitcoinwalk/walks';

export function useBitcoinWalks() {
  const [walks, setWalks] = useState<Walk[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await loadWalks(controller.signal);
      if (active.current === controller) setWalks(result);
    } catch {
      if (active.current === controller) setFailed(true);
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(start);
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  return { walks, loading, failed, refresh };
}
