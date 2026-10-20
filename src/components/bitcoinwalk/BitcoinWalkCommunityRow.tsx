import { View } from 'react-native';

import { Avatar } from '@/components/common/Avatar';
import { AppText } from '@/components/common/AppText';
import { InteractivePressable } from '@/components/common/InteractivePressable';
import { CountBadge } from '@/components/common/CountBadge';
import { spacing, uiDensity } from '@/theme';

type Props = {
  title: string;
  subtitle: string;
  picture: string | number;
  onPress: () => void;
  unreadCount?: number;
};

export function BitcoinWalkCommunityRow({ title, subtitle, picture, onPress, unreadCount = 0 }: Props) {
  return (
    <InteractivePressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{
        height: uiDensity.conversationRowHeight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Avatar pubkey="bitcoinwalk-community" picture={picture} size={uiDensity.contactAvatarSize} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText weight="semibold" numberOfLines={1}>{title}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>{subtitle}</AppText>
      </View>
      {unreadCount > 0 ? <CountBadge count={unreadCount} /> : null}
    </InteractivePressable>
  );
}
