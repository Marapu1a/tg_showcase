import { OrderAge } from '../components/OrderAge';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Order, OrdersResponse, money, statusNames } from '../api/client';
import { OrderWorkflow } from '../components/OrderWorkflow';
import { useLiveQuery } from '../lib/useLiveQuery';

function OrderDetails({
  id,
  onClose,
  onChanged,
  onRelated,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onRelated: () => void;
}) {
  const {
    data: order,
    error,
    loading,
    refresh,
  } = useLiveQuery<Order>(`/orders/${id}`, 0);
  return (
    <section className="detail-view" aria-label="Подробности заказа">
      <div className="button-row">
        <button className="secondary" onClick={onClose}>
          ← К списку заказов
        </button>
      </div>
      {loading && <p role="status">Загружаем заказ…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {order && (
        <>
          <h3>Заказ №{order.number}</h3>
          <span className={`status-pill status-${order.status.toLowerCase()}`}>
            {statusNames[order.status]}
          </span>
          <p>
            <strong>{order.productTitle}</strong> · {order.quantity} шт.
          </p>
          <p className="price">{money(order.totalMinor, order.currency)}</p>
          <OrderAge status={order.status} createdAt={order.createdAt} />
          <p>{order.buyerName}</p>
          <p>
            Контакт:{' '}
            {order.contactType === 'TELEGRAM' ? (
              <a
                className="contact-link"
                href={`https://t.me/${order.contact.slice(1)}`}
                target="_blank"
                rel="noreferrer"
              >
                {order.contact}
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
          {!order.contactVerified && (
            <p className="muted">Контакт указан покупателем вручную.</p>
          )}
          <div className="button-row">
            <button className="secondary" onClick={onRelated}>
              Заказы с этим контактом
            </button>
          </div>
          {order.comment && <p className="preserve-lines">{order.comment}</p>}
          <p className="muted">
            {new Date(order.createdAt).toLocaleString('ru-RU', {
              timeZone: 'Europe/Moscow',
            })}{' '}
            МСК
          </p>
          {order.notificationState === 'FAILED' && (
            <p className="alert">
              Уведомление в бот не доставлено. Заказ сохранён здесь.
            </p>
          )}
          <OrderWorkflow
            order={order}
            onChanged={() => {
              refresh();
              onChanged();
              window.dispatchEvent(new Event('orders-changed'));
            }}
          />
        </>
      )}
      {error && (
        <div className="button-row">
          <button onClick={refresh}>Повторить</button>
        </div>
      )}
    </section>
  );
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '',
    scope = params.get('scope') ?? 'active';
  const productId = params.get('productId') ?? '',
    from = params.get('from') ?? '',
    to = params.get('to') ?? '',
    relatedTo = params.get('relatedTo') ?? '';
  const [pages, setPages] = useState<string[]>(['']);
  const selected = params.get('order');
  function setSelected(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('order', id);
    else next.delete('order');
    setParams(next);
  }
  const before = pages[pages.length - 1]!;
  const query = new URLSearchParams({
    q,
    scope,
    productId,
    from,
    to,
    relatedTo,
  });
  if (before) query.set('before', before);
  const { data, error, loading, refresh } = useLiveQuery<OrdersResponse>(
    `/orders?${query}`,
  );
  const products = useLiveQuery<{ products: { id: string; title: string }[] }>(
    '/orders/products',
    0,
  );
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('order');
    setParams(next, { replace: true });
    setPages(['']);
  }
  function search(value: string) {
    change({
      q: value,
      ...(!q.trim() && value.trim() ? { scope: 'all', relatedTo: '' } : {}),
    });
  }
  return (
    <section className="panel management">
      <p className="eyebrow">Покупатели</p>
      <h2>Заказы</h2>
      {selected ? (
        <OrderDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={refresh}
          onRelated={() =>
            change({
              relatedTo: selected,
              scope: 'all',
              q: '',
              productId: '',
              from: '',
              to: '',
            })
          }
        />
      ) : (
        <>
          <div className="button-row" aria-label="Очередь заказов">
            {(['NEW', 'IN_PROGRESS'] as const).map((status) => (
              <button
                key={status}
                className={scope === status ? '' : 'secondary'}
                aria-pressed={scope === status}
                onClick={() =>
                  change({
                    scope: status,
                    q: '',
                    productId: '',
                    from: '',
                    to: '',
                    relatedTo: '',
                  })
                }
              >
                {status === 'NEW' ? 'Новые' : 'В работе'} —{' '}
                {data?.counts[status] ?? '…'}
              </button>
            ))}
          </div>
          <p className="muted">
            Новые — ещё не принятые заказы. Счётчики показывают все ваши заказы,
            независимо от поиска.
          </p>
          <div className="search-toolbar">
            <div className="field search-field">
              <label htmlFor="orders-search">Найти заказ или покупателя</label>
              <input
                id="orders-search"
                type="search"
                value={q}
                maxLength={100}
                onChange={(e) => search(e.target.value)}
                placeholder="Номер, имя, @telegram, телефон или товар"
                autoComplete="off"
              />
              <span className="muted">
                Только ваши заказы. Поиск обновляется по мере ввода.
              </span>
            </div>
            <div className="filter-stack">
              <div className="field">
                <label htmlFor="orders-scope">Статус</label>
                <select
                  id="orders-scope"
                  value={scope}
                  onChange={(e) => change({ scope: e.target.value })}
                >
                  <option value="all">Вся история</option>
                  <option value="active">Требуют внимания</option>
                  <option value="overdue">
                    Давно без обработки — старше суток
                  </option>
                  <option value="NEW">Новые</option>
                  <option value="IN_PROGRESS">В работе</option>
                  <option value="DONE">Выполненные</option>
                  <option value="CANCELLED">Отменённые</option>
                  <option value="RETURNED">Возвраты</option>
                  <option value="history">Вся завершённая история</option>
                </select>
              </div>
              <details
                className="search-filters"
                open={Boolean(productId || from || to) || undefined}
              >
                <summary>
                  Товар и период
                  {productId || from || to ? ' · фильтр включён' : ''}
                </summary>
                <div className="filter-grid">
                  <div className="field">
                    <label htmlFor="orders-product">Товар</label>
                    <select
                      id="orders-product"
                      value={productId}
                      onChange={(e) => change({ productId: e.target.value })}
                    >
                      <option value="">Все товары</option>
                      {products.data?.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    {products.error && (
                      <span className="field-error">
                        Список товаров недоступен.
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="orders-from">С даты · МСК</label>
                    <input
                      id="orders-from"
                      type="date"
                      min="2000-01-01"
                      max={to || '2100-12-31'}
                      value={from}
                      onChange={(e) => change({ from: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="orders-to">По дату · МСК</label>
                    <input
                      id="orders-to"
                      type="date"
                      min={from || '2000-01-01'}
                      max="2100-12-31"
                      value={to}
                      onChange={(e) => change({ to: e.target.value })}
                    />
                  </div>
                </div>
              </details>
            </div>
            {relatedTo && (
              <p className="alert">
                Заказы с выбранным контактом — только в вашем магазине.
              </p>
            )}
            <div className="button-row">
              <button
                className="secondary"
                onClick={() =>
                  change({
                    q: '',
                    scope: 'all',
                    productId: '',
                    from: '',
                    to: '',
                    relatedTo: '',
                  })
                }
              >
                Сбросить фильтры
              </button>
              <button
                className="secondary"
                disabled={loading}
                onClick={refresh}
              >
                Обновить
              </button>
            </div>
          </div>
          <p role="status" aria-live="polite">
            {loading ? 'Ищем…' : data ? `Найдено: ${data.total}` : ''}
          </p>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {!loading && data?.orders.length === 0 && (
            <p>
              Ничего не найдено. Попробуйте другой контакт или снимите фильтры.
            </p>
          )}
          <div className="compact-list" aria-busy={loading}>
            {data?.orders.map((order) => (
              <button
                className="compact-row order-row"
                key={order.id}
                onClick={() => setSelected(order.id)}
              >
                <span className="row-main">
                  <strong>
                    №{order.number} · {order.buyerName || order.contact}
                  </strong>
                  <span>
                    {order.productTitle} × {order.quantity}
                  </span>
                  {order.buyerName && (
                    <span className="muted">{order.contact}</span>
                  )}
                </span>
                <span className="row-meta">
                  <strong>{money(order.totalMinor, order.currency)}</strong>
                  <span
                    className={`status-pill status-${order.status.toLowerCase()}`}
                  >
                    {statusNames[order.status]}
                  </span>
                  <span className="muted">
                    <OrderAge
                      status={order.status}
                      createdAt={order.createdAt}
                    />
                    {new Date(order.createdAt).toLocaleDateString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                    })}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="button-row pagination">
            <button
              disabled={loading || pages.length === 1}
              onClick={() => setPages((current) => current.slice(0, -1))}
            >
              Назад
            </button>
            <span>Страница {pages.length}</span>
            <button
              disabled={loading || !data?.next}
              onClick={() =>
                data?.next &&
                setPages((current) => [...current, String(data.next)])
              }
            >
              Далее
            </button>
          </div>
        </>
      )}
      <p className="muted">
        «Выполнен» — ваша отметка о завершении заказа. Оплату сервис не
        проверяет.
      </p>
    </section>
  );
}
