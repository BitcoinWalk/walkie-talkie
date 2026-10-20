import { createInstance } from 'i18next';


import { platform } from '@/platform';

import ar from './ar.json';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import fa from './fa.json';
import fr from './fr.json';
import hi from './hi.json';
import hu from './hu.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import pl from './pl.json';
import ptBR from './pt-BR.json';
import ptPT from './pt-PT.json';
import ru from './ru.json';
import th from './th.json';
import tr from './tr.json';
import zh from './zh.json';
import zhHant from './zh-Hant.json';

const i18n = createInstance();

/** The languages the app ships translations for. */
export const LANGUAGES = [
  'en',
  'zh',
  'zh-Hant',
  'ar',
  'de',
  'es',
  'fa',
  'fr',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'pl',
  'pt-BR',
  'pt-PT',
  'ru',
  'th',
  'tr',
] as const;
export type Language = (typeof LANGUAGES)[number];

type Catalog = Record<string, unknown>;

/** BitcoinWalk-specific screens are introduced in English first. Keep their
 * complete, placeholder-safe fallback inside every shipped catalog until each
 * locale receives reviewed copy, instead of rendering raw translation keys. */
function withBitcoinWalkFallback(catalog: Catalog): Catalog {
  return {
    ...catalog,
    city_select: { ...en.city_select, ...(catalog.city_select as object | undefined) },
    walks: { ...en.walks, ...(catalog.walks as object | undefined) },
    tabs: { ...en.tabs, ...(catalog.tabs as object | undefined) },
    community: { ...en.community, ...(catalog.community as object | undefined) },
  };
}

/** Native-script labels stay readable even before the current UI language changes. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  ar: 'العربية',
  de: 'Deutsch',
  es: 'Español',
  fa: 'فارسی',
  fr: 'Français',
  hi: 'हिन्दी',
  hu: 'Magyar',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
};

export const TRANSLATIONS: Record<Language, object> = {
  en,
  zh: withBitcoinWalkFallback(zh),
  'zh-Hant': withBitcoinWalkFallback(zhHant),
  ar: withBitcoinWalkFallback(ar),
  de: withBitcoinWalkFallback(de),
  es: withBitcoinWalkFallback(es),
  fa: withBitcoinWalkFallback(fa),
  fr: withBitcoinWalkFallback(fr),
  hi: withBitcoinWalkFallback(hi),
  hu: withBitcoinWalkFallback(hu),
  it: withBitcoinWalkFallback(it),
  ja: withBitcoinWalkFallback(ja),
  ko: withBitcoinWalkFallback(ko),
  pl: withBitcoinWalkFallback(pl),
  'pt-BR': withBitcoinWalkFallback(ptBR),
  'pt-PT': withBitcoinWalkFallback(ptPT),
  ru: withBitcoinWalkFallback(ru),
  th: withBitcoinWalkFallback(th),
  tr: withBitcoinWalkFallback(tr),
};

/** Resolve a BCP-47 OS locale to a shipped catalog. */
export function matchSupportedLanguage(locale: string | null | undefined): Language {
  const normalized = locale?.replace(/_/g, '-').toLowerCase() ?? 'en';
  const [base, ...subtags] = normalized.split('-');

  if (base === 'zh') {
    if (subtags.includes('hant')) return 'zh-Hant';
    if (subtags.includes('hans')) return 'zh';
    return subtags.some((subtag) => ['tw', 'hk', 'mo'].includes(subtag)) ? 'zh-Hant' : 'zh';
  }
  if (base === 'pt') return subtags.includes('br') ? 'pt-BR' : 'pt-PT';

  const language = LANGUAGES.find((candidate) => candidate === base);
  return language ?? 'en';
}

/** Map the OS locale to one of our supported languages, falling back to English. */
export function getSystemLanguage(): Language {
  return matchSupportedLanguage(platform.localization.preferredLanguageTag());
}

void i18n.init({
  resources: Object.fromEntries(
    LANGUAGES.map((language) => [language, { translation: TRANSLATIONS[language] }]),
  ),
  // Start on the system language; the persisted preference (if any) is applied
  // at bootstrap by the language store before the first frame paints.
  lng: getSystemLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
