import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { ErrorBox } from "./DomainUI.jsx";
import MobileChrome from "./MobileChrome.jsx";
import { useMobile } from "../lib/useMobile.js";
import { DesktopIcon } from "./DesktopUI.jsx";
import businessIcon from "../assets/desktop/business.svg";
import userIcon from "../assets/desktop/user.svg";
import logoutIcon from "../assets/desktop/logout.svg";

export default function Layout({ onSignOut, children }) {
  const { t } = useLanguage(),
    { data, user, editor } = useWorkspace();
  const [error, setError] = useState(null),
    [mobileOverlay, setMobileOverlay] = useState(null);
  const mobile = useMobile();
  const items = [
    ["/", "dashboard", "home"],
    ...(editor ? [["/properties", "properties", "propertyNav"]] : []),
    ["/projects", "projects", "projectNav"],
    ["/transactions", "transactions", "transactions"],
    ["/contractors", "contractors", "contractors"],
    ["/settings", "settings", "settings"],
  ];
  return (
    <div className="appShell">
      <MobileChrome
        items={items}
        overlay={mobileOverlay}
        setOverlay={setMobileOverlay}
        onSignOut={onSignOut}
      />
      <header className="desktopHeader">
        <div className="desktopBusiness">
          <img src={businessIcon} alt="" />
          <p>{data.business.name}</p>
        </div>
        <div className="desktopUser">
          <img src={userIcon} alt="" />
          <span>{t("loggedInAs", { name: user.name })}</span>
          <button
            type="button"
            aria-label={t("signOut")}
            onClick={() => {
              if (window.confirm(t("logoutQuestion")))
                onSignOut().catch(setError);
            }}
          >
            <img src={logoutIcon} alt="" />
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <nav className="navList" aria-label={t("navigation")}>
          {items.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <DesktopIcon name={icon} />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <ErrorBox error={error} />
      </aside>
      <main className="mainContent" inert={mobile && Boolean(mobileOverlay)}>
        {children}
      </main>
    </div>
  );
}
