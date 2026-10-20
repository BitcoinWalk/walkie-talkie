import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { radius, spacing, useThemeColors } from '@/theme';

const BITCOINWALK_SPLASH_SOURCE = require('../../../assets/images/bitcoinwalk-splash.png');

type Props = {
  /** A plain-language line naming what's happening (a `boot.*` string). */
  message: string;
};

/**
 * The startup / sign-in screen shown while the app or an account is loading.
 * The bundled BitcoinWalk photograph continues the native launch experience
 * while a compact progress pill keeps longer startup work explicit. DESIGN §11.
 */
export function AppBootScreen({ message }: Props) {
  const { t } = useTranslation();
  const c = useThemeColors();
  const version = Constants.expoConfig?.version;

  return (
    <AppScreen edges={[]}>
      <View style={{ flex: 1 }}>
        <Image
          source={BITCOINWALK_SPLASH_SOURCE}
          accessible={false}
          cachePolicy="memory"
          contentFit="cover"
          contentPosition="center"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: spacing['2xl'],
          }}
        >
          <View
            style={{
              alignItems: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radius.full,
              backgroundColor: c.overlayControl,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <ActivityIndicator size="small" color={c.onOverlay} />
              <AppText variant="body" style={{ color: c.onOverlay }}>
                {message}
              </AppText>
            </View>
            {version ? (
              <AppText variant="caption" style={{ color: c.onOverlay }}>
                {t('about.version', { version })}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </AppScreen>
  );
}
