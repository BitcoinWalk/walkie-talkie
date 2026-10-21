import Bluetooth from 'lucide-react-native/icons/bluetooth';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IdentityListItem } from '@/components/common/IdentityListItem';
import { radius, uiDensity, useThemeColors } from '@/theme';
import { iconStrokeWidth } from '@/theme/icons';

export function NearbyRoomRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const c = useThemeColors();
  return <IdentityListItem title={t('nearby_room.title')} subtitle={t('nearby_room.coming_soon')}
    onPress={onPress} leading={<View style={{ width: uiDensity.contactAvatarSize,
      height: uiDensity.contactAvatarSize, borderRadius: radius.full,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Bluetooth size={uiDensity.headerActionIconSize} color={c.textMuted} strokeWidth={iconStrokeWidth.default} />
    </View>} />;
}
