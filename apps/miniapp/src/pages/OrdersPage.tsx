import { useEffect, useRef, useState } from 'react';
import {
  Order,
  OrdersResponse,
  OrderStatus,
  errorText,
  money,
  requestJson,
  statusNames,
} from '../api/client';

export function OrdersPage() {
  const [scope, setScope] = useState('active');
  const [data, setData] = useState<OrdersResponse>({
    orders: [],
    next: null,
    counts: {},
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    requestJson<OrdersResponse>(`/orders?scope=${scope}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, version]);
  async function update(order: Order, status: OrderStatus) {
    if (working.current || loading) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, expectedStatus: order.status }),
      });
      setLoading(true);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (working.current || loading) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await requestJson<OrdersResponse>(
        `/orders?scope=${scope}&before=${data.next}`,
      );
      setData((current) => ({
        ...next,
        orders: [...current.orders, ...next.orders],
      }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel onboarding">
      <p className="eyebrow">Покупатели</p>
      <h2>Заказы</h2>
      <p className="muted">
        Новых: {data.counts.NEW ?? 0} · В работе: {data.counts.IN_PROGRESS ?? 0}{' '}
        · Выполнено: {data.counts.DONE ?? 0}
      </p>
      <div className="button-row">
        <button
          disabled={busy || loading}
          aria-pressed={scope === 'active'}
          onClick={() => {
            if (scope === 'active') return;
            setLoading(true);
            setScope('active');
            setError('');
          }}
        >
          Требуют внимания
        </button>
        <button
          disabled={busy || loading}
          aria-pressed={scope === 'history'}
          onClick={() => {
            if (scope === 'history') return;
            setLoading(true);
            setScope('history');
            setError('');
          }}
        >
          История
        </button>
        <button
          disabled={busy || loading}
          onClick={() => {
            setError('');
            setLoading(true);
            setVersion((v) => v + 1);
          }}
        >
          Обновить
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">Загружаем заказы…</p>
      ) : data.orders.length === 0 ? (
        <p>Здесь пока нет заказов.</p>
      ) : (
        <div className="order-list">
          {data.orders.map((order) => (
            <article
              className={`order-card status-${order.status.toLowerCase()}`}
              key={order.id}
            >
              <p className="eyebrow">
                №{order.number} · {statusNames[order.status]}
              </p>
              <h3>{order.productTitle}</h3>
              <p>
                {order.quantity} шт. × {money(order.unitPriceMinor)} ={' '}
                <strong>{money(order.totalMinor)}</strong>
              </p>
              {order.buyerName && <p>{order.buyerName}</p>}
              <p>
                Контакт:{' '}
                {order.contactType === 'TELEGRAM' ? (
                  <a
                    className="contact-link"
                    href={`https://t.me/${order.contact.slice(1)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {order.contact} ↗
                  </a>
                ) : order.contactType === 'PHONE' ? (
                  <a
                    className="contact-link"
                    href={`tel:${order.contact.replace(/[^+0-9]/g, '')}`}
                  >
                    {order.contact}
                  </a>
                ) : (
                  order.contact
                )}
              </p>
              {order.contactType === 'TELEGRAM' && !order.contactVerified && (
                <p className="muted">Контакт указан покупателем вручную.</p>
              )}
              {order.comment && (
                <p className="preserve-lines">{order.comment}</p>
              )}
              <p className="muted">
                {new Date(order.createdAt).toLocaleString('ru-RU')}
              </p>
              {order.notificationState === 'FAILED' && (
                <p className="alert">
                  Уведомление в бот не доставлено. Заказ сохранён здесь.
                </p>
              )}
              {['NEW', 'IN_PROGRESS'].includes(order.status) && (
                <div className="button-row">
                  {order.status === 'NEW' && (
                    <button
                      disabled={busy || loading}
                      onClick={() => {
                        void update(order, 'IN_PROGRESS');
                      }}
                    >
                      Взять в работу
                    </button>
                  )}
                  <button
                    disabled={busy || loading}
                    onClick={() => {
                      void update(order, 'DONE');
                    }}
                  >
                    Выполнен
                  </button>
                  <button
                    disabled={busy || loading}
                    className="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Отменить заказ №${order.number}? Количество вернётся в доступные.`,
                        )
                      )
                        void update(order, 'CANCELLED');
                    }}
                  >
                    Отменить
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {data.next && (
        <div className="button-row">
          <button
            disabled={busy || loading}
            onClick={() => {
              void more();
            }}
          >
            Показать ещё
          </button>
        </div>
      )}
      <p className="muted">
        «Выполнен» — ваша отметка о завершении заказа. Оплату сервис не
        проверяет.
      </p>
    </section>
  );
}
