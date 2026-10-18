import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { User } from '@invest-insight/shared';
import { UNAUTHORIZED_EVENT, api } from './api';
import { Icon } from './components/ui';
import { setAmountsHidden } from './format';
import { Accounts } from './pages/Accounts';
import { Dashboard } from './pages/Dashboard';
import { ExposurePage } from './pages/Exposure';
import { HealthPage } from './pages/Health';
import { Holdings } from './pages/Holdings';
import { Login } from './pages/Login';
import { PerformancePage } from './pages/Performance';
import { PlanningPage } from './pages/Planning';
import { Rebalance } from './pages/Rebalance';
import { Settings } from './pages/Settings';
import { Transactions } from './pages/Transactions';

// 分组导航（参考 Ghostfolio 的 概览 / 组合 / 账户 分区）
const NAV = [
  {
    section: 'overview',
    items: [
      { to: '/', label: 'dashboard', icon: 'dashboard' },
      { to: '/performance', label: 'performance', icon: 'chart' },
    ],
  },
  {
    section: 'holdings',
    items: [
      { to: '/holdings', label: 'assets', icon: 'wallet' },
      { to: '/accounts', label: 'accounts', icon: 'bank' },
      { to: '/transactions', label: 'transactions', icon: 'list' },
    ],
  },
  {
    section: 'analysis',
    items: [
      { to: '/rebalance', label: 'rebalance', icon: 'target' },
      { to: '/exposure', label: 'exposure', icon: 'layers' },
      { to: '/health', label: 'health', icon: 'shield' },
    ],
  },
  {
    section: 'planning',
    items: [{ to: '/planning', label: 'planning', icon: 'flag' }],
  },
] as const;

function readHidden() {
  try {
    return localStorage.getItem('ii.hidden') === '1';
  } catch {
    return false;
  }
}

export function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [hidden, setHidden] = useState(readHidden);
  setAmountsHidden(hidden);

  useEffect(() => {
    api
      .get<User>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (user === undefined) return null;
  if (user === null) return <Login onLogin={setUser} />;

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  };

  const toggleHidden = () => {
    const next = !hidden;
    try {
      localStorage.setItem('ii.hidden', next ? '1' : '0');
    } catch {
      /* 忽略 */
    }
    setHidden(next);
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16l5-5 4 3 7-8" />
            </svg>
          </span>
          <span>Invest Insight</span>
        </div>
        {NAV.map((g) => (
          <div key={g.section} className="nav-group">
            <div className="nav-section">{t(`nav.sections.${g.section}`)}</div>
            {g.items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Icon name={n.icon} />
                {t(`nav.${n.label}`)}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="nav-group nav-bottom">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name="settings" />
            {t('nav.settings')}
          </NavLink>
        </div>
        <div className="user-box">
          <span className="who" title={user.username}>
            {user.username}
          </span>
          <span style={{ display: 'flex', gap: 2 }}>
            <button
              className="icon-btn"
              title={hidden ? t('nav.showAmounts') : t('nav.hideAmounts')}
              aria-label={hidden ? t('nav.showAmounts') : t('nav.hideAmounts')}
              aria-pressed={hidden}
              onClick={toggleHidden}
            >
              <Icon name={hidden ? 'eyeOff' : 'eye'} />
            </button>
            <button className="icon-btn" title={t('nav.logout')} aria-label={t('nav.logout')} onClick={logout}>
              <Icon name="logout" />
            </button>
          </span>
        </div>
      </nav>
      {/* 切换隐私模式或语言时重新挂载页面，金额、数字格式与服务端文案立即生效 */}
      <main className="main" key={`${hidden ? 'hidden' : 'shown'}-${i18n.language}`}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/rebalance" element={<Rebalance />} />
          <Route path="/exposure" element={<ExposurePage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
