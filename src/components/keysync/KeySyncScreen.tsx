import { ChatRoundDots } from '@solar-icons/react-native/category/messages/Linear/ChatRoundDots';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppContentColumn } from '@/components/common/AppContentColumn';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { useActiveAccount } from '@/stores/active-account.store';
import { spacing, useThemeColors } from '@/theme';

/**
 * BitcoinWalk's community experience does not depend on PsstPsst's optional
 * private-DM key. Let the user enter the app without rotating or deleting the
 * remote key; private messages simply remain unavailable on this device.
 */
export function KeySyncScreen() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const continueWithoutDmSync = useActiveAccount((s) => s.continueWithoutDmSync);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToBitcoinWalk() {
    if (continuing) return;
    setContinuing(true);
    setError(null);
    try {
      await continueWithoutDmSync();
    } catch {
      setError(t('key_sync.continue_failed'));
      setContinuing(false);
    }
  }

  return (
    <AppScreen>
      <AppContentColumn>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
            gap: spacing.xl,
          }}
        >
          <View style={{ alignItems: 'center', gap: spacing.lg }}>
            <ChatRoundDots size={44} color={c.accent} />
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <AppText variant="title" weight="semibold" align="center">
                {t('key_sync.continue_title')}
              </AppText>
              <AppText variant="body" tone="muted" align="center">
                {t('key_sync.continue_message')}
              </AppText>
            </View>
          </View>
          <View style={{ gap: spacing.sm }}>
            {error ? (
              <AppText variant="caption" tone="danger" align="center">
                {error}
              </AppText>
            ) : null}
            <AppButton
              label={t('key_sync.continue_action')}
              variant="primary"
              size="lg"
              loading={continuing}
              onPress={() => void continueToBitcoinWalk()}
            />
            <AppText variant="caption" tone="muted" align="center">
              {t('key_sync.continue_hint')}
            </AppText>
          </View>
        </View>
      </AppContentColumn>
    </AppScreen>
  );
}
