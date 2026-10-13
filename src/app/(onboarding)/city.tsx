import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/common/AppButton';
import { AppCard } from '@/components/common/AppCard';
import { AppInput } from '@/components/common/AppInput';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { loadCities, type BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { useActiveAccount } from '@/stores/active-account.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { spacing, useThemeColors } from '@/theme';

export default function ChooseCity() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const top = useScreenHeaderClearance();
  const activePubkey = useActiveAccount((state) => state.activePubkey);
  const select = useSelectedCity((state) => state.select);
  const [cities, setCities] = useState<BitcoinWalkCity[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void loadCities(controller.signal)
      .then((result) => {
        if (active.current === controller) setCities(result);
      })
      .catch(() => {
        if (active.current === controller) setFailed(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active.current === controller) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const start = setTimeout(refresh, 0);
    return () => {
      clearTimeout(start);
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? cities.filter((city) => [city.name, city.slug, ...city.aliases]
      .some((value) => value.toLocaleLowerCase().includes(needle))) : cities;
  }, [cities, query]);

  function choose(city: BitcoinWalkCity) {
    select(city);
    router.replace(activePubkey ? '/' : '/welcome');
  }

  return (
    <AppScreen edges={[]}>
      <ScreenHeader title={t('city_select.title')} back={false} />
      <FlatList
        data={visible}
        keyExtractor={(city) => city.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: top + spacing.lg,
          paddingBottom: insets.bottom + spacing['2xl'],
          gap: spacing.md,
        }}
        ListHeaderComponent={<View style={{ gap: spacing.md }}>
          <AppText variant="title">{t('city_select.heading')}</AppText>
          <AppText tone="muted">{t('city_select.intro')}</AppText>
          <AppInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('city_select.search')}
            accessibilityLabel={t('city_select.search')}
            autoCapitalize="none"
          />
          {failed ? <View style={{ gap: spacing.sm }}>
            <AppText tone="danger">{t('city_select.error')}</AppText>
            <AppButton variant="secondary" label={t('walks.retry')} onPress={refresh} />
          </View> : null}
        </View>}
        ListEmptyComponent={loading ? <ActivityIndicator color={c.accent} /> : !failed ?
          <AppText tone="muted" align="center">{t('city_select.empty')}</AppText> : null}
        renderItem={({ item }) => <AppCard style={{ gap: spacing.sm }}>
          <AppText variant="subtitle">BitcoinWalk in {item.name}</AppText>
          <AppText variant="caption" tone="muted">/{item.slug}</AppText>
          <AppButton variant="secondary" label={t('city_select.choose', { city: item.name })}
            onPress={() => choose(item)} />
        </AppCard>}
      />
    </AppScreen>
  );
}
