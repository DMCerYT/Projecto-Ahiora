import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { apiRequest } from '../lib/apiClient.js';

function AuthPage({ onAuth }) {
  const { language, setLanguage, t } = useLanguage();
  const [mode, setMode] = useState('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const endpoint = mode === 'signIn' ? '/api/auth/login' : '/api/auth/signup';
      const { user } = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setMessage(mode === 'signIn' ? t('signedIn') : t('accountCreated'));
      onAuth(user);
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setError('');
    setMessage('');
  }

  function oauthMessage() {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    if (!oauthStatus) return null;

    return (
      <div className="errorBox">
        {oauthStatus === 'no-email' ? t('oauthEmailMissing') : t('oauthUnavailable')}
      </div>
    );
  }

  return (
    <main className="authPage">
      <form className="authPanel" onSubmit={handleSubmit}>
        <div className="authTop">
          <div>
            <p className="eyebrow">{t('financialDashboard')}</p>
            <h1>{mode === 'signIn' ? t('signIn') : t('signUp')}</h1>
          </div>
          <label className="languageControl compact">
            {t('language')}
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">{t('english')}</option>
              <option value="es">{t('spanish')}</option>
            </select>
          </label>
        </div>

        {oauthMessage()}
        {error && <div className="errorBox">{error}</div>}
        {message && <div className="successBox">{message}</div>}

        <label>
          {t('email')}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>

        <label>
          {t('password')}
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength="8"
            required
          />
          {mode === 'signUp' && <span className="fieldHint">{t('passwordHint')}</span>}
        </label>

        <button className="primaryButton" type="submit" disabled={loading}>
          {loading ? t('pleaseWait') : mode === 'signIn' ? t('signIn') : t('signUp')}
        </button>

        <button className="secondaryActionButton" type="button" onClick={() => (window.location.href = '/api/auth/github')}>
          {t('continueWithGithub')}
        </button>

        <button className="linkButton" type="button" onClick={toggleMode}>
          {mode === 'signIn' ? t('needAccount') : t('alreadyHaveAccount')}
        </button>
      </form>
    </main>
  );
}

export default AuthPage;
