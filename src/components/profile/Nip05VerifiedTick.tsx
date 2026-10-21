import { VerifiedCheck } from '@solar-icons/react-native/category/money/Linear/VerifiedCheck';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { normalizeNip05Identifier, queryNip05Profile } from '@/lib/nostr/nip05';
import { typography, useThemeColors } from '@/theme';

export function Nip05VerifiedTick({ identifier, pubkey }: { identifier: string; pubkey: string }) {
  const normalized = normalizeNip05Identifier(identifier);
  return normalized ? <VerifiedIdentifier key={`${normalized}:${pubkey.toLowerCase()}`}
    identifier={normalized} pubkey={pubkey.toLowerCase()} /> : null;
}

function VerifiedIdentifier({ identifier, pubkey }: { identifier: string; pubkey: string }) {
  const c = useThemeColors();
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void queryNip05Profile(identifier).then((profile) => {
        if (active) setVerified(profile?.pubkey === pubkey);
      }).catch(() => { /* Unreachable identifiers remain unverified. */ });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [identifier, pubkey]);
  // The keyed instance discards verification immediately on an edit/account switch.
  return verified ? (
    <View accessibilityLabel="NIP-05 verified" accessibilityRole="image">
      <VerifiedCheck size={typography.caption.lineHeight} color={c.success} />
    </View>
  ) : null;
}
