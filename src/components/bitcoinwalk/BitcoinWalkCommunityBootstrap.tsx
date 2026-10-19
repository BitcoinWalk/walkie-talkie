import { useEffect } from 'react';

import { ensureCommunityMemberships } from '@/services/bitcoinwalk/community-membership';
import { communityChoicesForCity, loadCities } from '@/services/bitcoinwalk/cities';
import { useActiveAccount } from '@/stores/active-account.store';
import { useSelectedCity } from '@/stores/selected-city.store';

export function BitcoinWalkCommunityBootstrap() {
  const accountPubkey = useActiveAccount((state) => state.activePubkey);
  const selectedCity = useSelectedCity((state) => state.selectedCity);
  const selectCity = useSelectedCity((state) => state.select);

  useEffect(() => {
    if (!accountPubkey || !selectedCity) return;
    const controller = new AbortController();

    void (async () => {
      let city = selectedCity;
      try {
        const cities = await loadCities(controller.signal);
        const current = cities.find((candidate) => candidate.id === selectedCity.id);
        if (current && !controller.signal.aborted) {
          city = current;
          if (JSON.stringify(current) !== JSON.stringify(selectedCity)) selectCity(current);
        }
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
      }
      if (controller.signal.aborted) return;
      const cityDestination = communityChoicesForCity(city)
        .find((choice) => choice.scope === 'city')?.destination;
      if (!cityDestination) return;
      // A signed-in profile follows its selected city automatically. Global is
      // deliberately left as an explicit choice in the Chats tab.
      await ensureCommunityMemberships(accountPubkey, [cityDestination]).catch(() => {});
    })();

    return () => controller.abort();
  }, [accountPubkey, selectCity, selectedCity]);

  return null;
}
