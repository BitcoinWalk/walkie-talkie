import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { spacing, uiDensity, useThemeColors } from '@/theme';

export function BitcoinWalkGuideNotice({ message }: { message: string }) {
  const c = useThemeColors();
  return (
    <View
      accessibilityRole="text"
      style={{
        minHeight: uiDensity.chatNoticeVerticalPadding * 2,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: uiDensity.chatNoticeVerticalPadding,
        backgroundColor: c.surfaceElevated,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      }}
    >
      <AppText variant="caption" tone="muted" align="center">
        {message}
      </AppText>
    </View>
  );
}
