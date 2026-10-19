import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import type { PublicCommunityScope } from '@/services/bitcoinwalk/city-page-links';
import type { BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { spacing } from '@/theme';

type Props = {
  city: BitcoinWalkCity;
  bottomClearance: number;
  onChangeCity: () => void;
  onOpenCommunity: (scope: PublicCommunityScope) => void;
};

export function BitcoinWalkCityPage({ city, bottomClearance, onChangeCity }: Props) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, paddingBottom: bottomClearance }}>
      {createElement('iframe', { src: city.canonicalUrl, title: city.name,
        style: { width: '100%', height: '100%', border: 0 } })}
      <View style={{ position: 'absolute', top: spacing.md, insetInlineEnd: spacing.md }}>
        <AppButton variant="overlay" size="sm" compact corner="full" fullWidth={false}
          label={t('walks.change_city')} onPress={onChangeCity} />
      </View>
    </View>
  );
}
