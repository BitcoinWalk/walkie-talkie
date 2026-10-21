import Check from 'lucide-react-native/icons/check';
import SearchX from 'lucide-react-native/icons/search-x';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { iconStrokeWidth } from '@/theme/icons';
import { spacing, uiDensity, useThemeColors } from '@/theme';

import { AppInput } from '@/components/common/AppInput';
import { AppText } from '@/components/common/AppText';
import { BottomSheet } from '@/components/common/BottomSheet';
import { BitcoinWalkCommunityRow } from './BitcoinWalkCommunityRow';

type Props = {
  visible: boolean;
  cities: BitcoinWalkCity[];
  selectedSlug: string | null;
  onClose: () => void;
  onSelect: (city: BitcoinWalkCity) => void;
};

export function BitcoinWalkCityPickerSheet({
  visible,
  cities,
  selectedSlug,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const c = useThemeColors();
  const [query, setQuery] = useState('');

  const filteredCities = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0
      ? cities
      : cities.filter((city) => city.name.toLocaleLowerCase().includes(normalized));
  }, [cities, query]);

  return (
    <BottomSheet<BitcoinWalkCity>
      visible={visible}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={t('community.city_picker_title')}
      fixedSubheader={(
        <AppInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('community.city_picker_search')}
          accessibilityLabel={t('community.city_picker_search')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      )}
      listProps={{
        data: filteredCities,
        keyExtractor: (city) => city.id,
        keyboardDismissMode: 'on-drag',
        renderItem: ({ item: city }) => {
          const selected = city.slug === selectedSlug;
          return (
            <BitcoinWalkCommunityRow
              title={city.name}
              subtitle={selected ? t('community.city_picker_selected') : undefined}
              picture={city.avatarUrl}
              selected={selected}
              trailing={selected ? (
                <Check
                  color={c.accent}
                  size={uiDensity.headerActionIconSize}
                  strokeWidth={iconStrokeWidth.default}
                />
              ) : undefined}
              onPress={() => {
                setQuery('');
                onSelect(city);
              }}
            />
          );
        },
        ListEmptyComponent: (
          <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
            <SearchX
              color={c.textMuted}
              size={uiDensity.contactAvatarSize}
              strokeWidth={iconStrokeWidth.default}
            />
            <AppText variant="subtitle">{t('community.city_picker_empty')}</AppText>
            <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {t('community.city_picker_empty_hint')}
            </AppText>
          </View>
        ),
        contentContainerStyle: { paddingBottom: spacing.lg },
      }}
    />
  );
}
