import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// 直接导入 JSON 文件
import enTranslation from '../public/locales/en/translation.json';
import zhTranslation from '../public/locales/zh-CN/translation.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      'zh-CN': { translation: zhTranslation }
    },
    lng: 'zh-CN',          // 👈 设置为中文
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export default i18n;