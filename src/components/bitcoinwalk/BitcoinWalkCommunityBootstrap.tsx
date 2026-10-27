import { useEffect } from 'react';

import {
  ensureCommunityMemberships,
  hasCommunityMembership,
} from '@/services/bitcoinwalk/community-membership';
import { registerCommunityNotifications } from '@/services/bitcoinwalk/community-notifications';
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
      const destinations = communityChoicesForCity(city)
        .filter((choice) => choice.scope === 'city')
        .map((choice) => choice.destination);
      if (destinations.length === 0) return;
      // Choosing a city establishes only that signed-in city context. Global
      // stays an explicit join from Chat, avoiding a second surprise signer
      // approval while the membership service remembers confirmed relay state.
      await ensureCommunityMemberships(accountPubkey, destinations).catch(() => {});
      await Promise.all(destinations.map(async (destination) => {
        if (await hasCommunityMembership(accountPubkey, destination)) {
          await registerCommunityNotifications(accountPubkey, destination);
        }
      }));
    })();

    return () => controller.abort();
  }, [accountPubkey, selectCity, selectedCity]);

  return null;
}
