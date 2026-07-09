import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { entityConfigs } from './config/entities.js';
import { useLanguage } from './i18n/LanguageContext.jsx';
import { apiRequest } from './lib/apiClient.js';
import AuthPage from './pages/AuthPage.jsx';
import BillsPage from './pages/BillsPage.jsx';
import CrudPage from './pages/CrudPage.jsx';
import Dashboard from './pages/Dashboard.jsx';

function App() {
  const { t } = useLanguage();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/api/session')
      .then(({ user }) => {
        setSession(user ? { user } : null);
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleSignOut() {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setSession(null);
  }

  if (loading) {
    return <div className="fullPageState">{t('loadingApp')}</div>;
  }

  if (!session) {
    return <AuthPage onAuth={(user) => setSession({ user })} />;
  }

  return (
    <Layout user={session.user} onSignOut={handleSignOut}>
      <Routes>
        <Route path="/" element={<Dashboard user={session.user} />} />
        {Object.keys(entityConfigs).map((entityKey) => (
          <Route
            key={entityKey}
            path={`/${entityKey}`}
            element={
              entityKey === 'bills' ? (
                <BillsPage user={session.user} />
              ) : (
                <CrudPage entityKey={entityKey} user={session.user} />
              )
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
