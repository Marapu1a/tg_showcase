import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { requestJson } from '../api/client';

export function NewOrdersLink() {
  const location = useLocation();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function update() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await requestJson<{ count: number }>('/orders/new-count', {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!controller.signal.aborted) setCount(data.count);
      } catch {
        if (!controller.signal.aborted) setCount(null);
      } finally {
        pending = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 30000);
    window.addEventListener('orders-changed', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('orders-changed', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [location.key]);
  return (
    <Link className="nav-link" to="/orders?scope=NEW">
      Новые{count === null ? '' : ` — ${count}`}
    </Link>
  );
}
