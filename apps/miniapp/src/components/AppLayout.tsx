import { NewOrdersLink } from './NewOrdersLink';
import { useLiveQuery } from '../lib/useLiveQuery';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
function OwnerLink() {
  const { data } = useLiveQuery<{ isOwner: boolean }>('/owner-access', 0);
  return data?.isOwner ? <Link to="/admin">Управление TG Zoo</Link> : null;
}
export function AppLayout() {
  useEffect(() => {
    const app = window.Telegram?.WebApp;
    const root = document.documentElement;
    const sync = () => {
      // The SDK also exists in a normal browser. Only actual theme parameters
      // should override prefers-color-scheme there.
      if (!app?.themeParams?.bg_color) return;
      root.dataset.theme = app.colorScheme ?? 'light';
      for (const [key, value] of Object.entries(app.themeParams)) {
        if (/^[a-z_]+$/.test(key) && /^#[a-f\d]{6}$/i.test(value))
          root.style.setProperty(
            `--tg-theme-${key.replaceAll('_', '-')}`,
            value,
          );
      }
    };
    sync();
    app?.onEvent?.('themeChanged', sync);
    return () => app?.offEvent?.('themeChanged', sync);
  }, []);
  const { pathname } = useLocation();
  const buyerPage = /^\/offers\/(?!new$)[^/]+$/.test(pathname);
  const hubPage =
    pathname === '/hub' ||
    pathname.startsWith('/projects/') ||
    (pathname === '/' && !window.Telegram?.WebApp?.initData);
  const ownerPage = pathname === '/admin';
  const sellerPage = !buyerPage && !hubPage && !ownerPage;
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link
          to={hubPage || ownerPage ? '/hub' : '/dashboard'}
          aria-label="На главную"
        >
          <h1>{hubPage || ownerPage ? 'TG Zoo' : 'PocketShowcase'}</h1>
          <p className="brand-caption">
            {hubPage || ownerPage
              ? 'Полезные проекты для Telegram'
              : buyerPage
                ? 'Товары из Telegram'
                : 'Продажи в вашем канале'}
          </p>
        </Link>
        {sellerPage && window.Telegram?.WebApp?.initData && <NewOrdersLink />}
        {hubPage && (
          <Link to="/admin" className="nav-link">
            Для команды
          </Link>
        )}
      </header>
      {sellerPage && window.Telegram?.WebApp?.initData && (
        <nav className="nav seller-nav" aria-label="Основная навигация">
          <NavLink className="nav-link" to="/dashboard">
            Канал
          </NavLink>
          <NavLink className="nav-link" to="/products">
            Товары
          </NavLink>
          <NavLink className="nav-link" to="/orders">
            Заказы
          </NavLink>
          <NavLink className="nav-link" to="/billing">
            Оплата сервиса
          </NavLink>
        </nav>
      )}
      <main className="page-content">
        <Outlet />
      </main>
      <footer className="app-footer muted">
        {!hubPage && <Link to="/hub">TG Zoo</Link>}
        {window.Telegram?.WebApp?.initData && !ownerPage && <OwnerLink />}
        <Link to="/terms">Условия</Link>
        <Link to="/privacy">Обработка данных</Link>
      </footer>
    </div>
  );
}
