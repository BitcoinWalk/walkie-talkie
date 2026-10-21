import { memo } from 'react';

import { AppText } from '@/components/common/AppText';
import { useDisplayName } from '@/hooks/use-display-name';

/** Resolve only mounted senders; the shared profile loader caches and coalesces requests. */
export const CommunitySenderName = memo(function CommunitySenderName({ pubkey }: { pubkey: string }) {
  const { name } = useDisplayName(pubkey);
  return <AppText variant="caption" tone="muted" numberOfLines={1}>{name}</AppText>;
});
