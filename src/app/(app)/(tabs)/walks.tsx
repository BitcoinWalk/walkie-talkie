import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BitcoinWalkCityPage } from '@/components/bitcoinwalk/BitcoinWalkCityPage';
import { AppScreen } from '@/components/common/AppScreen';
import type { PublicCommunityScope } from '@/services/bitcoinwalk/city-page-links';
import { useBitcoinWalkCommunity } from '@/stores/bitcoinwalk-community.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { bottomBarHeight } from '@/theme';

export default function WalksTab() {
  const city = useSelectedCity((state) => state.selectedCity)!;
  const selectCommunity = useBitcoinWalkCommunity((state) => state.select);
  const insets = useSafeAreaInsets();

  function openCommunity(scope: PublicCommunityScope) {
    selectCommunity(scope);
    router.navigate('/');
  }

  return (
    <AppScreen edges={['top']}>
      <BitcoinWalkCityPage
        city={city}
        bottomClearance={bottomBarHeight + insets.bottom}
        onChangeCity={() => router.push('/city')}
        onOpenCommunity={openCommunity}
        onOpenChat={(href) => router.navigate(href)}
      />
    </AppScreen>
  );
}
