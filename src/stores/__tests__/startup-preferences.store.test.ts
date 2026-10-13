import { getDevicePreference } from '@/services/preferences/device-preferences.service';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import { useLanguageStore } from '../language.store';
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
    jest.mocked(getDevicePreference).mockResolvedValue(JSON.stringify(city));

    await expect(useSelectedCity.getState().load()).resolves.toBeUndefined();
    expect(useSelectedCity.getState()).toMatchObject({ selectedCity: city, loaded: true });
  });
});
