import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/common/Avatar';
import { AppText } from '@/components/common/AppText';
import { InteractivePressable } from '@/components/common/InteractivePressable';
import { CountBadge } from '@/components/common/CountBadge';
import { spacing, uiDensity } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  picture: string | number;
  onPress: () => void;
  unreadCount?: number;
  selected?: boolean;
  trailing?: ReactNode;
};

export function BitcoinWalkCommunityRow({
  title,
  subtitle,
  picture,
  onPress,
  unreadCount = 0,
  selected = false,
  trailing,
}: Props) {
  return (
    <View style={{ height: uiDensity.conversationRowHeight, flexDirection: 'row', alignItems: 'center' }}>
      <InteractivePressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={{
          height: uiDensity.conversationRowHeight,
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Avatar pubkey="bitcoinwalk-community" picture={picture} size={uiDensity.contactAvatarSize} />
        <View style={{ flex: 1, gap: subtitle ? spacing.xs : 0 }}>
          <AppText weight="semibold" numberOfLines={1}>{title}</AppText>
          {subtitle ? <AppText variant="caption" tone="muted" numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
        {unreadCount > 0 ? <CountBadge count={unreadCount} /> : null}
      </InteractivePressable>
      {trailing ? <View style={{ marginEnd: spacing.sm }}>{trailing}</View> : null}
    </View>
  );
}
