import { Link, Outlet, useLocation } from 'react-router-dom';
export function AppLayout() {
  const { pathname } = useLocation();
  const buyerPage = /^\/offers\/(?!new$)[^/]+$/.test(pathname);
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/dashboard" aria-label="На главную">
          <p className="eyebrow">Продажи в вашем канале</p>
          <h1>Витрина</h1>
        </Link>
      </header>
      {!buyerPage && window.Telegram?.WebApp?.initData && (
        <nav className="nav seller-nav">
          <Link className="nav-link" to="/dashboard">
            Канал
          </Link>
          <Link className="nav-link" to="/products">
            Товары
          </Link>
          <Link className="nav-link" to="/orders">
            Заказы
          </Link>
        </nav>
      )}
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
