import { create } from 'zustand';

import type { BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import {
  getDevicePreference,
  trySetDevicePreference,
} from '@/services/preferences/device-preferences.service';

const PREFERENCE_KEY = 'bitcoinwalk.selectedCity';

function storedCity(value: string | null): BitcoinWalkCity | null {
  if (!value) return null;
  try {
    const city = JSON.parse(value) as BitcoinWalkCity;
    if (!(typeof city.id === 'string' && typeof city.name === 'string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug) &&
      city.canonicalUrl === `${BITCOINWALK_ORIGIN}/${encodeURIComponent(city.slug)}` && city.chat)) {
      return null;
    }
    const legacyDestination = city.chat.nip29 ?? null;
    return {
      ...city,
      avatarUrl: city.avatarUrl ?? `${BITCOINWALK_ORIGIN}/brand/bitcoinwalk-share-fallback.jpg`,
      chat: {
        ...city.chat,
        communities: city.chat.communities ?? {
          global: city.chat.scope === 'global' ? legacyDestination : null,
          city: city.chat.scope === 'city' ? legacyDestination : null,
        },
      },
    };
  } catch {
    return null;
  }
}

type State = {
  selectedCity: BitcoinWalkCity | null;
  loaded: boolean;
  load: () => Promise<void>;
  select: (city: BitcoinWalkCity) => void;
};

export const useSelectedCity = create<State>((set) => ({
  selectedCity: null,
  loaded: false,
  load: async () => {
    try {
      set({ selectedCity: storedCity(await getDevicePreference(PREFERENCE_KEY)) });
    } catch (error) {
      console.warn('[bitcoinwalk] Failed to restore selected city.', error);
    } finally {
      set({ loaded: true });
    }
  },
  select: (city) => {
    set({ selectedCity: city });
    void trySetDevicePreference(PREFERENCE_KEY, JSON.stringify(city));
  },
}));
