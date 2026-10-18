import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { Segmented } from '../components/ui';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import type { User } from '@invest-insight/shared';

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.post<User>('/api/auth/login', { username, password }));
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 8px' }}>
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16l5-5 4 3 7-8" />
            </svg>
          </span>
          <span>Invest Insight</span>
        </div>
        <p className="secondary" style={{ margin: '0 0 20px' }}>
          {t('login.subtitle')}
        </p>
        <div className="stack" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="username">{t('login.username')}</label>
            <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary" type="submit" disabled={busy || !username || !password} style={{ justifyContent: 'center', padding: '9px 14px' }}>
            {busy ? t('login.signingIn') : t('login.signIn')}
          </button>
        </div>
        <p className="help" style={{ margin: '16px 0 0' }}>
          {t('login.help')}
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Segmented value={i18n.language as Lang} onChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
      </form>
    </div>
  );
}
