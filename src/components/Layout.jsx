import { NavLink } from 'react-router-dom';
import { navItems } from '../config/entities.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';

function Layout({ user, onSignOut, children }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">{t('appEyebrow')}</p>
          <h1>{t('appName')}</h1>
        </div>

        <nav className="navList" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="accountBox">
          <div className="demoBadge">{t('localMode')}</div>
          <label className="languageControl">
            {t('language')}
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">{t('english')}</option>
              <option value="es">{t('spanish')}</option>
            </select>
          </label>
          <span>{user?.email}</span>
          <button type="button" className="secondaryButton" onClick={onSignOut}>
            {t('signOut')}
          </button>
        </div>
      </aside>

      <main className="mainContent">{children}</main>
    </div>
  );
}

export default Layout;
