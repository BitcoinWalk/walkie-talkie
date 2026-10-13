import MapPin from 'lucide-react-native/icons/map-pin';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/common/AppButton';
import { AppCard } from '@/components/common/AppCard';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { useBitcoinWalks } from '@/hooks/use-bitcoinwalk-walks';
import { platform } from '@/platform';
import { bottomBarHeight, spacing, uiDensity, useThemeColors } from '@/theme';

export default function WalksTab() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const top = useScreenHeaderClearance();
  const { walks, loading, failed, refresh } = useBitcoinWalks();
  const [linkFailed, setLinkFailed] = useState(false);
  async function open(url: string) {
    setLinkFailed(false);
    try {
      if (!(await platform.urlOpener.openExternalUrl(url))) setLinkFailed(true);
    } catch { setLinkFailed(true); }
  }
  return (
    <AppScreen edges={[]}>
      <ScreenHeader title={t('walks.title')} back={false} />
      <FlatList
        data={walks}
        keyExtractor={(walk) => walk.id}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: top + spacing.lg,
          paddingBottom: bottomBarHeight + insets.bottom + spacing['2xl'], gap: spacing.lg }}
        ListHeaderComponent={<View style={{ gap: spacing.sm }}>
          <AppText variant="title">{t('walks.heading')}</AppText>
          <AppText tone="muted">{t('walks.intro')}</AppText>
          {failed && <><AppText tone="danger">{t('walks.error')}</AppText>
            <AppButton variant="secondary" label={t('walks.retry')} onPress={refresh} /></>}
          {linkFailed && <AppText tone="danger">{t('walks.link_error')}</AppText>}
        </View>}
        ListEmptyComponent={loading ? <ActivityIndicator color={c.accent} /> : !failed ?
          <View style={{ gap: spacing.md, alignItems: 'center', padding: spacing.xl }}>
            <MapPin color={c.textMuted} size={uiDensity.tabIconSize} />
            <AppText variant="subtitle">{t('walks.empty')}</AppText>
            <AppText tone="muted">{t('walks.empty_hint')}</AppText>
          </View> : null}
        renderItem={({ item }) => <AppCard style={{ gap: spacing.md }}>
          <AppText variant="subtitle">{item.name}</AppText>
          <AppText>{new Intl.DateTimeFormat(i18n.resolvedLanguage, {
            dateStyle: 'medium', timeStyle: 'short', timeZone: item.timeZone,
          }).format(new Date(item.startDate))}</AppText>
          <AppText variant="caption" tone="muted">{item.timeZone}</AppText>
          <AppText weight="medium">{item.address}</AppText>
          <AppText numberOfLines={4} tone="muted">{item.description}</AppText>
          <AppButton variant="secondary" label={t('walks.details')} onPress={() => void open(item.link)} />
          <AppButton variant="text" label={t('walks.directions')} onPress={() => void open(
            `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`,
          )} />
        </AppCard>}
      />
    </AppScreen>
  );
}
