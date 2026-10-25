import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './locales/ru';
import { en } from './locales/en';
import { ar } from './locales/ar';

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: 'ru',
  fallbackLng: 'en',
  supportedLngs: ['ru', 'en', 'ar'],
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
