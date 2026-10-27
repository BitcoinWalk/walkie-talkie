import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { AppFormScrollView } from '@/components/common/AppFormScrollView';
import { AppButton } from '@/components/common/AppButton';
import { AppContentColumn } from '@/components/common/AppContentColumn';
import { AppInput } from '@/components/common/AppInput';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { OrDivider } from '@/components/common/OrDivider';
import { QrScanButton } from '@/components/common/QrScanButton';
import { OnboardingFormLayout } from '@/components/onboarding/OnboardingFormLayout';
import { useScrolled } from '@/hooks/use-scrolled';
import { useFocusAfterTransition } from '@/hooks/use-focus-after-transition';
import { loginWithBunker } from '@/services/signer/nip46-connect.service';
import type { BunkerLoginPhase } from '@/services/signer/nip46-connect.service';
import { classifyBunkerLoginError } from '@/services/signer/nip46-login-error';
import { exportAppErrorDiagnostics, recordAppError } from '@/services/diagnostics/app-error-diagnostics.service';
import { platform } from '@/platform';
import { useActiveAccount } from '@/stores/active-account.store';
import { spacing } from '@/theme';
import { postSignInHref } from '@/services/bitcoinwalk/pending-chat-target';

export default function LoginBunker() {
  const { scrolled, scrollProps } = useScrolled();
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<BunkerLoginPhase>('approval');
  const [exporting, setExporting] = useState(false);
  const setActive = useActiveAccount((s) => s.setActive);
  const inputRef = useFocusAfterTransition();

  async function submit() {
    if (loading) return;
    setError(null);
    setPhase('approval');
    setLoading(true);
    try {
      const { pubkey } = await loginWithBunker(input.trim(), setPhase);
      await setActive(pubkey);
      router.replace(await postSignInHref());
    } catch (cause) {
      const code = classifyBunkerLoginError(cause);
      setError(t(`login.bunker.errors.${code}`));
      // Store only the failure code; bunker links and signer errors may contain secrets.
      void recordAppError({
        errorName: `BunkerLogin_${code}`,
        route: 'login-bunker',
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        build: String(Platform.OS === 'ios'
          ? Constants.expoConfig?.ios?.buildNumber ?? 'unknown'
          : Constants.expoConfig?.android?.versionCode ?? 'unknown'),
        platform: Platform.OS,
        platformVersion: String(Platform.Version),
      });
      setLoading(false);
    }
  }

  async function exportDiagnostics() {
    setExporting(true);
    try {
      const uri = await exportAppErrorDiagnostics();
      if (uri && await platform.sharing.isAvailable()) await platform.sharing.share(uri);
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppScreen edges={['bottom']}>
      <OnboardingFormLayout bordered={scrolled} title={t('login.bunker.title')}>
        <AppContentColumn>
          <AppFormScrollView
            {...scrollProps}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.xl,
              gap: spacing.xl,
            }}
          >
            <AppText variant="body" tone="muted">
              {t('login.bunker.subtitle')}
            </AppText>

            <AppInput
              ref={inputRef}
              placeholder={t('login.bunker.placeholder')}
              value={input}
              onChangeText={(value) => { setInput(value); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              description={loading ? t(`login.bunker.progress.${phase}`) : undefined}
              error={error ?? undefined}
              editable={!loading}
              trailingAccessory={<QrScanButton onScanned={(data) => setInput(data.trim())} />}
            />

            <View style={{ gap: spacing.lg }}>
              <AppButton
                label={t('login.bunker.submit')}
                variant="primary"
                size="lg"
                loading={loading}
                disabled={!input.trim()}
                onPress={submit}
              />

              <OrDivider label={t('common.or')} />

              <AppButton
                label={t('login.bunker.use_nostr_connect')}
                variant="secondary"
                size="lg"
                disabled={loading}
                onPress={() => router.push('/login-nostr-connect')}
              />
              {error ? (
                <AppButton
                  label={t('error.export_diagnostics')}
                  variant="secondary"
                  loading={exporting}
                  onPress={() => { void exportDiagnostics().catch(() => {}); }}
                />
              ) : null}
            </View>
          </AppFormScrollView>
        </AppContentColumn>
      </OnboardingFormLayout>
    </AppScreen>
  );
}
