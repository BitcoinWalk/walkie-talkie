import { create } from 'zustand';

import {
  getDevicePreference,
  trySetDevicePreference,
} from '@/services/preferences/device-preferences.service';

const PREFERENCE_KEY = 'bitcoinwalk.chatCity';
const CITY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type State = {
  preferredSlug: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  select: (slug: string | null) => void;
};

/** A chat-only city preference. Until the user chooses one here, Chat follows
 * the city selected in Walk; changing this preference never changes Walk. */
export const useChatCity = create<State>((set) => ({
  preferredSlug: null,
  loaded: false,
  load: async () => {
    try {
      const stored = await getDevicePreference(PREFERENCE_KEY);
      set({ preferredSlug: stored && CITY_SLUG.test(stored) ? stored : null });
    } catch (error) {
      console.warn('[bitcoinwalk] Failed to restore the chat city.', error);
    } finally {
      set({ loaded: true });
    }
  },
  select: (slug) => {
    set({ preferredSlug: slug });
    void trySetDevicePreference(PREFERENCE_KEY, slug ?? '');
  },
}));
