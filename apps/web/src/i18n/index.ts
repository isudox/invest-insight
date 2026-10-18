import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import zh from './zh-CN';

export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'ii.lang';

/** 优先使用设置页选择的语言，其次跟随浏览器，中文环境默认简体中文，其他默认英文 */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    /* 忽略 */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zh }, en: { translation: en } },
  lng: detect(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false,
  // 关闭 i18next 在控制台输出的推广信息
  showSupportNotice: false,
});

const applyHtmlLang = (lng: string) => document.documentElement.setAttribute('lang', lng);
applyHtmlLang(i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export function setLanguage(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 忽略 */
  }
  void i18n.changeLanguage(lang);
}

export const currentLang = (): Lang => (i18n.language === 'en' ? 'en' : 'zh-CN');

export default i18n;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof zh };
  }
}
