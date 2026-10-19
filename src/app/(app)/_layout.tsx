import { Redirect } from 'expo-router';

import { MediaViewer } from '@/components/common/MediaViewer';
import { ResponsiveAppNavigator } from '@/components/navigation/ResponsiveAppNavigator';
import { KeySyncRequestSheet } from '@/components/keysync/KeySyncRequestSheet';
import { CustomEmojiSync } from '@/components/emoji/CustomEmojiSync';
import { CustomEmojiDetailSheet } from '@/components/emoji/CustomEmojiDetailSheet';
import { NearbyChatRequestSheet } from '@/components/proximity/nearby-chat-request-sheet';
import { BitcoinWalkCommunityBootstrap } from '@/components/bitcoinwalk/BitcoinWalkCommunityBootstrap';
import { useActiveAccount } from '@/stores/active-account.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { useThemeColors } from '@/theme';

export default function AppLayout() {
  const activePubkey = useActiveAccount((s) => s.activePubkey);
  const selectedCity = useSelectedCity((s) => s.selectedCity);
  const c = useThemeColors();

  if (!selectedCity) return <Redirect href="/city" />;

  return (
    <>
      {activePubkey ? <BitcoinWalkCommunityBootstrap /> : null}
      <ResponsiveAppNavigator backgroundColor={c.background} />
      <KeySyncRequestSheet />
      <NearbyChatRequestSheet />
      <CustomEmojiSync />
      <CustomEmojiDetailSheet />
      <MediaViewer />
    </>
  );
}
