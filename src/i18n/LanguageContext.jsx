import { createContext, useContext, useMemo, useState } from 'react';
import { translations } from './translations.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    localStorage.setItem('language', nextLanguage);
  }

  const value = useMemo(() => {
    const dictionary = translations[language] || translations.en;

    function t(key, replacements = {}) {
      const value = key.split('.').reduce((current, part) => current?.[part], dictionary) || key;
      return Object.entries(replacements).reduce(
        (text, [name, replacement]) => text.replace(`{${name}}`, replacement),
        value
      );
    }

    return { language, setLanguage: changeLanguage, t };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}
