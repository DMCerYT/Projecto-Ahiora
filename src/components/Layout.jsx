import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { apiRequest } from "../lib/apiClient.js";
import { ErrorBox } from "./DomainUI.jsx";
import MobileChrome from "./MobileChrome.jsx";
import { useMobile } from "../lib/useMobile.js";

export default function Layout({ onSignOut, children }) {
  const { language, setLanguage, t } = useLanguage(),
    { data, user, setUser, editor } = useWorkspace();
  const [error, setError] = useState(null);
  const [mobileOverlay, setMobileOverlay] = useState(null);
  const mobile = useMobile();
  const items = [
    ["/", "dashboard"],
    ["/projects", "projects"],
    ["/transactions", "transactions"],
    ["/bills", "bills"],
    ["/contractors", "contractors"],
    ...(editor
      ? [
          ["/team", "team"],
          ["/settings", "settings"],
        ]
      : []),
  ];
  async function changeLanguage(next) {
    setError(null);
    try {
      const { user: updated } = await apiRequest("/api/me/language", {
        method: "PUT",
        body: JSON.stringify({ preferred_language: next }),
      });
      setUser(updated);
      setLanguage(next);
    } catch (nextError) {
      setError(nextError);
    }
  }
  return (
    <div className="appShell">
      <MobileChrome
        items={items}
        overlay={mobileOverlay}
        setOverlay={setMobileOverlay}
        onSignOut={onSignOut}
      />
      <aside className="sidebar">
        <div>
          <p className="eyebrow">{data.business.name}</p>
          <h1>Ahiora</h1>
        </div>
        <nav className="navList" aria-label={t("navigation")}>
          {items.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="accountBox">
          <strong>{user.name}</strong>
          <span>{t(`statuses.${user.role}`)}</span>
          <label className="languageControl">
            {t("language")}
            <select
              value={language}
              onChange={(event) => changeLanguage(event.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <ErrorBox error={error} />
          <button
            className="secondaryButton"
            onClick={() => onSignOut().catch(setError)}
          >
            {t("signOut")}
          </button>
        </div>
      </aside>
      <main className="mainContent" inert={mobile && Boolean(mobileOverlay)}>
        {children}
      </main>
    </div>
  );
}
