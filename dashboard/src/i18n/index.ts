import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';

const savedLang = localStorage.getItem('language') || navigator.language;
const defaultLang = savedLang.startsWith('zh-TW') || savedLang === 'zh-Hant'
  ? 'zh-TW'
  : savedLang.startsWith('zh')
    ? 'zh-CN'
    : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTW },
    'zh-CN': { translation: zhCN },
  },
  lng: defaultLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

export const languages = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
] as const;

export function changeLanguage(code: string) {
  localStorage.setItem('language', code);
  i18n.changeLanguage(code);
}
