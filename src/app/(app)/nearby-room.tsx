import Bluetooth from 'lucide-react-native/icons/bluetooth';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { spacing, uiDensity, useThemeColors } from '@/theme';
import { iconStrokeWidth } from '@/theme/icons';

/** Parked public-mesh entry point. It deliberately performs no Bluetooth work. */
export default function NearbyRoomScreen() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const clearance = useScreenHeaderClearance();

  return <AppScreen edges={['bottom']}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingTop: clearance, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl,
      gap: spacing.md }}>
      <View style={{ width: uiDensity.contactAvatarSize, height: uiDensity.contactAvatarSize,
        alignItems: 'center', justifyContent: 'center' }}>
        <Bluetooth color={c.textMuted} size={uiDensity.contactAvatarSize} strokeWidth={iconStrokeWidth.default} />
      </View>
      <AppText variant="title" align="center">{t('nearby_room.coming_soon_title')}</AppText>
      <AppText tone="muted" align="center">{t('nearby_room.coming_soon_description')}</AppText>
    </View>
    <ScreenHeader title={t('nearby_room.title')} />
  </AppScreen>;
}
