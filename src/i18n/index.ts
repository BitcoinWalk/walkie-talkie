import { initReactI18next } from 'react-i18next';

import i18n from './core';

i18n.use(initReactI18next);
initReactI18next.init(i18n);

export * from './core';
export default i18n;
