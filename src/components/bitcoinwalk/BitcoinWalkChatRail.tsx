import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Avatar } from '@/components/common/Avatar';
import { HorizontalFadeScrollView } from '@/components/common/HorizontalFadeScrollView';
import { InteractivePressable } from '@/components/common/InteractivePressable';
import { SectionLabel } from '@/components/common/SectionLabel';
import {
  countBadge,
  radius,
  spacing,
  uiDensity,
  useThemeColors,
} from '@/theme';

export type BitcoinWalkChatDestination = {
  key: 'city' | 'guide' | 'global' | 'hosts';
  title: string;
  subtitle: string;
  picture?: string | number | null;
  fallbackLabel?: string;
  unreadCount?: number;
  active?: boolean;
  available: boolean;
  onPress: () => void;
};

type Props = {
  destinations: BitcoinWalkChatDestination[];
  label: string;
  onLayout?: (height: number) => void;
};

function DestinationAvatar({ destination }: { destination: BitcoinWalkChatDestination }) {
  const c = useThemeColors();
  if (destination.picture) {
    return (
      <Avatar
        pubkey={`bitcoinwalk-${destination.key}`}
        picture={destination.picture}
        size={uiDensity.contactAvatarSize}
      />
    );
  }
  return (
    <View
      style={{
        width: uiDensity.contactAvatarSize,
        height: uiDensity.contactAvatarSize,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.accentSoft,
      }}
    >
      <AppText variant="caption" weight="semibold" style={{ color: c.accent }}>
        {destination.fallbackLabel}
      </AppText>
    </View>
  );
}

function DestinationCard({ destination }: { destination: BitcoinWalkChatDestination }) {
  const c = useThemeColors();
  const unreadCount = Math.min(destination.unreadCount ?? 0, 99);
  return (
    <InteractivePressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.title}, ${destination.subtitle}`}
      accessibilityState={{ disabled: !destination.available, selected: destination.active }}
      disabled={!destination.available}
      fallbackHoverOpacity={false}
      onPress={destination.onPress}
      style={{
        width: uiDensity.profileActionWidth + spacing.xl,
        minHeight: uiDensity.contactAvatarSize + spacing['3xl'],
        borderRadius: radius.xl,
        borderWidth: destination.active ? 1 : 0,
        borderColor: destination.active ? c.accent : c.border,
        backgroundColor: destination.active ? c.accentSoft : c.surfaceElevated,
        overflow: 'hidden',
        opacity: destination.available ? 1 : 0.55,
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            padding: spacing.sm,
          }}
        >
          {pressed ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                insetInlineStart: 0,
                insetInlineEnd: 0,
                backgroundColor: c.interactionOverlay,
              }}
            />
          ) : null}
          <View>
            <DestinationAvatar destination={destination} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -spacing.xs,
                  insetInlineEnd: -spacing.sm,
                  minWidth: countBadge.md.size,
                  height: countBadge.md.size,
                  paddingHorizontal: countBadge.md.horizontalPadding,
                  borderRadius: radius.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.notification,
                }}
              >
                <AppText variant="micro" weight="semibold" style={{ color: c.onOverlay }}>
                  {unreadCount === 99 && (destination.unreadCount ?? 0) > 99 ? '99+' : unreadCount}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" weight="semibold" align="center" numberOfLines={1}>
            {destination.title}
          </AppText>
          <AppText variant="micro" tone="muted" align="center" numberOfLines={1}>
            {destination.subtitle}
          </AppText>
        </View>
      )}
    </InteractivePressable>
  );
}

export function BitcoinWalkChatRail({ destinations, label, onLayout }: Props) {
  const c = useThemeColors();
  return (
    <View
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
      style={{ gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.md }}
    >
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SectionLabel>{label}</SectionLabel>
      </View>
      <HorizontalFadeScrollView
        fadeColor={c.background}
        contentContainerStyle={{
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
        }}
      >
        {destinations.map((destination) => (
          <DestinationCard key={destination.key} destination={destination} />
        ))}
      </HorizontalFadeScrollView>
    </View>
  );
}
