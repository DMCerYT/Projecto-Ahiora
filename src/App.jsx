import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLanguage } from "./i18n/LanguageContext.jsx";
import { apiRequest } from "./lib/apiClient.js";
import { WorkspaceProvider, useWorkspace } from "./lib/WorkspaceContext.jsx";
import Layout from "./components/Layout.jsx";
import { ErrorBox } from "./components/DomainUI.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { ProjectsPage, ProjectDetails } from "./pages/ProjectsPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import BillsPage from "./pages/BillsPage.jsx";
import {
  ContractorsPage,
  TeamPage,
  SettingsPage,
} from "./pages/ManagementPages.jsx";

export default function App() {
  const { t, setLanguage } = useLanguage();
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [githubEnabled, setGithubEnabled] = useState(false);
  useEffect(() => {
    apiRequest("/api/session")
      .then((session) => {
        setUser(session.user);
        setGithubEnabled(session.github_enabled);
        if (session.user) setLanguage(session.user.preferred_language);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="fullPageState">{t("loading")}</div>;
  if (error)
    return (
      <div className="authPage">
        <ErrorBox error={error} />
        <button onClick={() => window.location.reload()}>{t("retry")}</button>
      </div>
    );
  if (!user)
    return (
      <AuthPage
        githubEnabled={githubEnabled}
        onAuth={(next) => {
          setUser(next);
          setLanguage(next.preferred_language);
        }}
      />
    );
  return (
    <WorkspaceProvider key={user.id} user={user} setUser={setUser}>
      <WorkspaceApp
        onSignOut={async () => {
          await apiRequest("/api/auth/logout", { method: "POST" });
          setUser(null);
        }}
      />
    </WorkspaceProvider>
  );
}
function WorkspaceApp({ onSignOut }) {
  const { t } = useLanguage(),
    { data, error, loading, load, editor } = useWorkspace();
  if (!data)
    return (
      <main className="mainContent">
        <ErrorBox error={error} />
        {loading ? (
          t("loading")
        ) : (
          <button onClick={() => load().catch(() => {})}>{t("retry")}</button>
        )}
      </main>
    );
  return (
    <Layout onSignOut={onSignOut}>
      <ErrorBox error={error} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetails />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/contractors" element={<ContractorsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {editor && (
          <>
            <Route path="/team" element={<TeamPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
