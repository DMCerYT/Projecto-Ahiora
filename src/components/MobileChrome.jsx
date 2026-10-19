import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";
import { useMobile } from "../lib/useMobile.js";
import { ErrorBox } from "./DomainUI.jsx";
import { BillPaymentPicker, TransactionEditor } from "./FinancialEditors.jsx";
import group from "../assets/mobile/group.svg";
import userIcon from "../assets/mobile/user.svg";
import home from "../assets/mobile/home.svg";
import menu from "../assets/mobile/menu.svg";
import add from "../assets/mobile/add.svg";
import addBackground from "../assets/mobile/add-background.svg";
import addBackgroundActive from "../assets/mobile/add-background-active.svg";
import actionCallout from "../assets/mobile/action-callout.svg";
import signOut from "../assets/mobile/sign-out.svg";
import signOutConfirm from "../assets/mobile/sign-out-confirm.svg";

export default function MobileChrome({
  items,
  overlay,
  setOverlay,
  onSignOut,
}) {
  const { t } = useLanguage(),
    { data, user, editor } = useWorkspace();
  const mobile = useMobile(),
    location = useLocation();
  const overlayContent = useRef(null),
    restoreFocus = useRef(null);
  const [form, setForm] = useState(null),
    [signingOut, setSigningOut] = useState(false),
    [error, setError] = useState(null);
  const mobileItems = items;
  const hasProjects =
    data.properties.length > 0 ||
    data.projects.some((project) => project.status !== "archived");

  useEffect(() => {
    setOverlay(null);
  }, [location.key, setOverlay]);
  useEffect(() => {
    if (!mobile) setOverlay(null);
  }, [mobile, setOverlay]);
  useEffect(() => {
    if (!mobile || !overlay) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayContent.current
      ?.querySelector("[data-overlay-focus]")
      ?.focus({ preventScroll: true });
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOverlay(null);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", escape);
      restoreFocus.current?.focus({ preventScroll: true });
    };
  }, [mobile, overlay, setOverlay]);

  function toggle(next, event) {
    restoreFocus.current = event.currentTarget;
    setError(null);
    setOverlay(overlay === next ? null : next);
  }
  async function confirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      await onSignOut();
    } catch (next) {
      setError(next);
      setSigningOut(false);
    }
  }
  function launch(next) {
    setOverlay(null);
    setForm(next);
  }
  function navigateFromMobile() {
    setOverlay(null);
    window.scrollTo(0, 0);
  }

  return (
    <>
      {mobile && (
        <>
          <header className="mobileHeader">
            <div className="mobileBusiness">
              <img src={group} width="64" height="64" alt="" />
              <p title={data.business.name}>{data.business.name}</p>
            </div>
            <div className="mobileUser">
              <img src={userIcon} width="24" height="24" alt="" />
              <span title={user.name}>
                {t("loggedInAs", { name: user.name })}
              </span>
              <button
                className="mobileSignOut"
                type="button"
                aria-label={t("signOut")}
                aria-expanded={overlay === "logout"}
                aria-controls="mobile-logout"
                onClick={(event) => toggle("logout", event)}
              >
                <img src={signOut} width="28" height="28" alt="" />
              </button>
            </div>
          </header>
          {overlay && (
            <>
              <button
                type="button"
                className="mobileBlur"
                tabIndex="-1"
                aria-label={t("dismissOverlay")}
                onClick={() => setOverlay(null)}
              />
              {overlay === "navigation" && (
                <nav
                  ref={overlayContent}
                  id="mobile-navigation"
                  className="mobileNavigation"
                  aria-label={t("navigation")}
                >
                  {mobileItems.map(([to, label], index) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      data-overlay-focus={index === 0 ? "" : undefined}
                      onClick={navigateFromMobile}
                    >
                      {t(label)}
                    </NavLink>
                  ))}
                </nav>
              )}
              {overlay === "actions" && (
                <div
                  ref={overlayContent}
                  id="mobile-actions"
                  className="mobileActions"
                  role="group"
                  aria-label={t("quickActions")}
                >
                  <img
                    className="mobileActionBackground"
                    src={actionCallout}
                    width="264"
                    height="194"
                    alt=""
                  />
                  <button
                    data-overlay-focus
                    className="mobileNewTransaction"
                    disabled={!hasProjects}
                    onClick={() => launch("transaction")}
                  >
                    {t("quickNewTransaction")}
                  </button>
                  <button
                    className="mobileBillPayment"
                    onClick={() => launch("payment")}
                  >
                    {t("billPayment")}
                  </button>
                </div>
              )}
              {overlay === "logout" && (
                <section
                  ref={overlayContent}
                  className="mobileLogout"
                  id="mobile-logout"
                  role="dialog"
                  aria-labelledby="mobile-logout-question"
                >
                  <p id="mobile-logout-question">{t("logoutQuestion")}</p>
                  <div className="mobileLogoutButtons">
                    <button
                      data-overlay-focus
                      className="mobileStay"
                      disabled={signingOut}
                      onClick={() => setOverlay(null)}
                    >
                      {t("staySignedIn")}
                    </button>
                    <button
                      className="mobileConfirmSignOut"
                      disabled={signingOut}
                      onClick={confirmSignOut}
                    >
                      <img src={signOutConfirm} width="48" height="48" alt="" />
                      <span>{t(signingOut ? "signingOut" : "logOut")}</span>
                    </button>
                  </div>
                  <ErrorBox error={error} />
                </section>
              )}
            </>
          )}
          <nav className="mobileDock" aria-label={t("mobileControls")}>
            <div className="mobileDockPill" />
            <Link
              to="/"
              className="mobileHome"
              aria-label={t("home")}
              onClick={navigateFromMobile}
            >
              <img src={home} width="48" height="48" alt="" />
            </Link>
            <button
              type="button"
              className="mobileAdd"
              aria-label={t("quickActions")}
              aria-expanded={overlay === "actions"}
              aria-controls="mobile-actions"
              disabled={!editor}
              title={!editor ? t("financialActionsUnavailable") : undefined}
              onClick={(event) => toggle("actions", event)}
            >
              <img
                className="mobileAddBackground"
                src={
                  overlay === "actions" ? addBackgroundActive : addBackground
                }
                width="100"
                height="100"
                alt=""
              />
              <img
                className="mobileAddIcon"
                src={add}
                width="82"
                height="82"
                alt=""
              />
            </button>
            <button
              type="button"
              className="mobileMenu"
              aria-label={t("menu")}
              aria-expanded={overlay === "navigation"}
              aria-controls="mobile-navigation"
              onClick={(event) => toggle("navigation", event)}
            >
              <img src={menu} width="48" height="48" alt="" />
            </button>
          </nav>
        </>
      )}
      {form === "transaction" && editor && (
        <TransactionEditor onClose={() => setForm(null)} />
      )}
      {form === "payment" && editor && (
        <BillPaymentPicker onClose={() => setForm(null)} />
      )}
    </>
  );
}
