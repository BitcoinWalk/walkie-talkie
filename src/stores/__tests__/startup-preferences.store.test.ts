import {
  getDevicePreference,
  trySetDevicePreference,
} from '@/services/preferences/device-preferences.service';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import { useLanguageStore } from '../language.store';
import { useChatCity } from '../chat-city.store';
import { useSelectedCity } from '../selected-city.store';
import { useThemeStore } from '../theme.store';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn(async () => {}) },
  getSystemLanguage: () => 'en',
  LANGUAGES: ['en', 'zh'],
}));
jest.mock('@/services/preferences/device-preferences.service', () => ({
  getDevicePreference: jest.fn(),
  trySetDevicePreference: jest.fn(async () => {}),
}));

describe('startup preference recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    useThemeStore.setState({ preference: 'system', accent: 'orange', loaded: false });
    useLanguageStore.setState({ preference: 'system', loaded: false });
    useChatCity.setState({ preferredSlug: null, loaded: false });
    useSelectedCity.setState({ selectedCity: null, loaded: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('releases the appearance gate when storage fails', async () => {
    jest.mocked(getDevicePreference).mockRejectedValue(new Error('storage unavailable'));

    await expect(useThemeStore.getState().load()).resolves.toBeUndefined();

    expect(useThemeStore.getState()).toMatchObject({
      preference: 'system',
      accent: 'orange',
      loaded: true,
    });
  });

  it('releases the language gate when storage fails', async () => {
    jest.mocked(getDevicePreference).mockRejectedValue(new Error('storage unavailable'));

    await expect(useLanguageStore.getState().load()).resolves.toBeUndefined();

    expect(useLanguageStore.getState()).toMatchObject({
      preference: 'system',
      loaded: true,
    });
  });

  it('restores a city only from the configured BitcoinWalk environment', async () => {
    const city = {
      id: 'madeira', name: 'Madeira', slug: 'madeira', aliases: [],
      canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
      chat: { scope: 'global', url: 'https://bitcoinwalk.org/join' },
    };
    jest.mocked(getDevicePreference).mockImplementation(async (key) => key === 'bitcoinwalk.cityEntryVersion'
      ? '1'
      : JSON.stringify(city));

    await expect(useSelectedCity.getState().load()).resolves.toBeUndefined();
    expect(useSelectedCity.getState()).toMatchObject({ selectedCity: city, loaded: true });
  });

  it('removes a legacy dedicated Armada relay from cached Walkie Talkie data', async () => {
    const city = {
      id: 'london', name: 'London', slug: 'london', aliases: [],
      canonicalUrl: `${BITCOINWALK_ORIGIN}/london`,
      chat: {
        scope: 'city', url: null,
        nip29: { relay: 'wss://london.bitcoinwalk.org/', groupId: 'bitcoinwalk-london' },
      },
    };
    jest.mocked(getDevicePreference).mockImplementation(async (key) => key === 'bitcoinwalk.cityEntryVersion'
      ? '1'
      : JSON.stringify(city));

    await expect(useSelectedCity.getState().load()).resolves.toBeUndefined();
    expect(useSelectedCity.getState().selectedCity?.chat).toMatchObject({
      nip29: null,
      communities: { global: null, city: null },
    });
  });

  it('opens the city mosaic once when upgrading from the earlier city flow', async () => {
    jest.mocked(getDevicePreference).mockImplementation(async (key) => key === 'bitcoinwalk.selectedCity'
      ? JSON.stringify({
        id: 'warszawa', name: 'Warszawa', slug: 'warszawa', aliases: [],
        canonicalUrl: `${BITCOINWALK_ORIGIN}/warszawa`,
        chat: { scope: 'global', url: 'https://bitcoinwalk.org/join' },
      })
      : null);

    await expect(useSelectedCity.getState().load()).resolves.toBeUndefined();

    expect(useSelectedCity.getState()).toMatchObject({ selectedCity: null, loaded: true });
    expect(getDevicePreference).toHaveBeenCalledWith('bitcoinwalk.cityEntryVersion');
    expect(getDevicePreference).not.toHaveBeenCalledWith('bitcoinwalk.selectedCity');
  });

  it('marks a city chosen from the current mosaic so it is restored next time', () => {
    const city = {
      id: 'madeira', name: 'Madeira', slug: 'madeira', aliases: [],
      canonicalUrl: `${BITCOINWALK_ORIGIN}/madeira`,
      avatarUrl: `${BITCOINWALK_ORIGIN}/brand/bitcoinwalk-share-fallback.jpg`,
      chat: {
        scope: 'global' as const,
        url: 'https://bitcoinwalk.org/join',
        nip29: null,
        communities: { global: null, city: null },
      },
    };

    useSelectedCity.getState().select(city);

    expect(trySetDevicePreference).toHaveBeenCalledWith(
      'bitcoinwalk.selectedCity',
      JSON.stringify(city),
    );
    expect(trySetDevicePreference).toHaveBeenCalledWith('bitcoinwalk.cityEntryVersion', '1');
  });

  it('restores an independent chat city without changing the Walk city', async () => {
    jest.mocked(getDevicePreference).mockResolvedValue('augsburg');

    await expect(useChatCity.getState().load()).resolves.toBeUndefined();

    expect(useChatCity.getState()).toMatchObject({ preferredSlug: 'augsburg', loaded: true });
    expect(useSelectedCity.getState().selectedCity).toBeNull();

    useChatCity.getState().select('madeira');
    expect(trySetDevicePreference).toHaveBeenCalledWith('bitcoinwalk.chatCity', 'madeira');
  });
});
