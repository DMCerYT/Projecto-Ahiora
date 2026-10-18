import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { apiRequest } from "../lib/apiClient.js";
import { ErrorBox, Fields } from "../components/DomainUI.jsx";

export default function AuthPage({ onAuth, githubEnabled }) {
  const { language, setLanguage, t } = useLanguage();
  const [signup, setSignup] = useState(false),
    [form, setForm] = useState({}),
    [error, setError] = useState(null),
    [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user } = await apiRequest(
        `/api/auth/${signup ? "signup" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({ ...form, preferred_language: language }),
        },
      );
      onAuth(user);
    } catch (next) {
      setError(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="authPage">
      <form className="authPanel" onSubmit={submit}>
        <div className="authTop">
          <div>
            <p className="eyebrow">Ahiora</p>
            <h1>{t(signup ? "signUp" : "signIn")}</h1>
          </div>
          <label className="languageControl compact">
            {t("language")}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
        <p className="mutedText">{t("tagline")}</p>
        <ErrorBox error={error} />
        {new URLSearchParams(window.location.search).has("oauth") && (
          <ErrorBox error={{ code: "oauthUnavailable" }} />
        )}
        <Fields
          fields={[
            ...(signup
              ? [
                  { name: "name", required: true },
                  { name: "business_name", required: true },
                ]
              : []),
            { name: "email", type: "email", required: true },
            {
              name: "password",
              type: "password",
              required: true,
              hint: "passwordHint",
            },
          ]}
          form={form}
          setForm={setForm}
        />
        <button className="primaryButton" disabled={saving}>
          {t(saving ? "saving" : signup ? "signUp" : "signIn")}
        </button>
        {githubEnabled && (
          <a className="smallButton" href="/api/auth/github">
            {t("github")}
          </a>
        )}
        <button
          className="linkButton"
          type="button"
          onClick={() => {
            setSignup(!signup);
            setError(null);
          }}
        >
          {t(signup ? "alreadyAccount" : "newAccount")}
        </button>
      </form>
    </main>
  );
}
