import { useFocusEffect } from 'expo-router';
import { FileText } from '@solar-icons/react-native/category/files/Linear/FileText';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ListGroup } from '@/components/common/ListGroup';
import { ListRow } from '@/components/common/ListRow';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { useScrolled } from '@/hooks/use-scrolled';
import { platform } from '@/platform';
import {
  clearAppDiagnostics,
  exportAppErrorDiagnostics,
  readAppDiagnostics,
  type AppDiagnosticLogEntry,
} from '@/services/diagnostics/app-error-diagnostics.service';
import { spacing, useThemeColors } from '@/theme';

export default function LogsSettings() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const titleClearance = useScreenHeaderClearance();
  const { scrolled, scrollProps } = useScrolled();
  const [entries, setEntries] = useState<AppDiagnosticLogEntry[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'medium' }),
    [i18n.language],
  );

  const load = useCallback(() => {
    let active = true;
    void readAppDiagnostics().then((next) => {
      if (active) setEntries(next);
    });
    return () => { active = false; };
  }, []);

  useFocusEffect(load);

  async function shareLogs() {
    if (exporting) return;
    setExporting(true);
    try {
      const uri = await exportAppErrorDiagnostics();
      const available = await platform.sharing.isAvailable();
      if (uri && available) {
        await platform.sharing.share(uri);
      } else {
        await platform.confirmationDialog.notify({
          title: t('logs.share_failed'),
          okLabel: t('common.ok'),
        });
      }
    } catch {
      await platform.confirmationDialog.notify({
        title: t('logs.share_failed'),
        okLabel: t('common.ok'),
      });
    } finally {
      setExporting(false);
    }
  }

  async function requestClear() {
    const confirmed = await platform.confirmationDialog.confirm({
      title: t('logs.clear_title'),
      message: t('logs.clear_message'),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('logs.clear'),
      destructive: true,
    });
    if (!confirmed) return;
    await clearAppDiagnostics();
    setEntries([]);
  }

  return (
    <AppScreen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: titleClearance,
          paddingBottom: spacing['3xl'],
          gap: spacing.xl,
        }}
        {...scrollProps}
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="body" tone="muted">
            {t('logs.description')}
          </AppText>
          <AppText variant="caption" tone="muted">
            {t('logs.privacy')}
          </AppText>
        </View>

        {entries === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.textMuted} />
          </View>
        ) : entries.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingVertical: spacing['3xl'],
            }}
          >
            <FileText size={40} color={c.textMuted} />
            <AppText variant="subtitle" weight="semibold" align="center">
              {t('logs.empty_title')}
            </AppText>
            <AppText variant="body" tone="muted" align="center">
              {t('logs.empty_hint')}
            </AppText>
          </View>
        ) : (
          <ListGroup>
            {entries.map((entry, index) => (
              <ListRow
                key={`${entry.occurredAt}:${entry.area}:${entry.code}:${index}`}
                title={entry.code}
                subtitle={`${entry.level} · ${entry.area} · ${formatter.format(entry.occurredAt)}`}
                subtitleMultiline
                belowValue={entry.detail ? (
                  <AppText variant="code" tone="muted" numberOfLines={3}>
                    {entry.detail}
                  </AppText>
                ) : undefined}
                valuePlacement="below"
              />
            ))}
          </ListGroup>
        )}

        <View style={{ gap: spacing.sm }}>
          <AppButton
            label={t('logs.share')}
            variant="secondary"
            loading={exporting}
            disabled={entries === null}
            onPress={() => { void shareLogs(); }}
          />
          <AppButton
            label={t('logs.clear')}
            variant="danger"
            disabled={!entries?.length}
            onPress={() => { void requestClear(); }}
          />
        </View>
      </ScrollView>
      <ScreenHeader title={t('logs.title')} bordered={scrolled} />
    </AppScreen>
  );
}
