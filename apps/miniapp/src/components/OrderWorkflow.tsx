import { useRef, useState } from 'react';
import {
  ApiRequestError,
  Order,
  OrderStatus,
  errorText,
  requestJson,
  statusNames,
} from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';

type Mutation = {
  requestKey: string;
  status: OrderStatus;
  expectedStatus: OrderStatus;
  expectedVersion: number;
  reason?: string;
  restock?: boolean;
};
type Entry = {
  id: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  reason: string | null;
  stockDelta: number;
  createdAt: string;
};
const choices: Record<
  OrderStatus,
  { status: OrderStatus; label: string; reason: boolean; danger?: boolean }[]
> = {
  NEW: [
    { status: 'IN_PROGRESS', label: 'Взять в работу', reason: false },
    {
      status: 'CANCELLED',
      label: 'Отменить заказ',
      reason: true,
      danger: true,
    },
  ],
  IN_PROGRESS: [
    { status: 'DONE', label: 'Выполнен', reason: false },
    { status: 'NEW', label: 'Вернуть в новые', reason: true },
    {
      status: 'CANCELLED',
      label: 'Отменить заказ',
      reason: true,
      danger: true,
    },
  ],
  DONE: [
    {
      status: 'RETURNED',
      label: 'Оформить возврат',
      reason: true,
      danger: true,
    },
    { status: 'IN_PROGRESS', label: 'Вернуть в работу', reason: true },
  ],
  CANCELLED: [
    { status: 'IN_PROGRESS', label: 'Восстановить в работу', reason: true },
  ],
  RETURNED: [
    { status: 'DONE', label: 'Отменить отметку возврата', reason: true },
  ],
};

function OrderHistory({ id }: { id: string }) {
  const [pages, setPages] = useState(['']);
  const query = new URLSearchParams({ before: pages[pages.length - 1]! });
  const { data, error, loading, refresh } = useLiveQuery<{
    events: Entry[];
    next: string | null;
  }>(`/orders/${id}/history?${query}`, 0);
  return (
    <section className="order-history" aria-label="История изменений">
      <h4>История изменений</h4>
      {loading && <p role="status">Загружаем историю…</p>}
      {error && (
        <>
          <p role="alert" className="alert error">
            {error}
          </p>
          <button onClick={refresh}>Повторить загрузку истории</button>
        </>
      )}
      {data?.events.length === 0 && (
        <p className="muted">
          Изменений пока нет. Для старых заказов история ведётся с обновления
          приложения.
        </p>
      )}
      <ol className="history-list">
        {data?.events.map((event) => (
          <li key={event.id}>
            <strong>
              {statusNames[event.fromStatus]} → {statusNames[event.toStatus]}
            </strong>
            <p className="muted">
              {new Date(event.createdAt).toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
              })}{' '}
              МСК · Продавец
            </p>
            {event.reason && <p className="preserve-lines">{event.reason}</p>}
            <p className="muted">
              {event.stockDelta < 0
                ? `В остаток возвращено: ${-event.stockDelta} шт.`
                : event.stockDelta > 0
                  ? `Зарезервировано: ${event.stockDelta} шт.`
                  : 'Остаток не изменялся.'}
            </p>
          </li>
        ))}
      </ol>
      {(pages.length > 1 || data?.next) && (
        <div className="button-row">
          <button
            disabled={loading || pages.length === 1}
            onClick={() => setPages((p) => p.slice(0, -1))}
          >
            Более новые
          </button>
          <button
            disabled={loading || !data?.next}
            onClick={() => data?.next && setPages((p) => [...p, data.next!])}
          >
            Более ранние
          </button>
        </div>
      )}
    </section>
  );
}

export function OrderWorkflow({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  const slot = `order-action:${order.id}`;
  const [pending, setPending] = useState<Mutation | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(slot) ?? 'null');
    } catch {
      return null;
    }
  });
  const [choice, setChoice] = useState<{
    status: OrderStatus;
    label: string;
  } | null>(null);
  const [reason, setReason] = useState(''),
    [restock, setRestock] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const working = useRef(false);
  async function send(payload: Mutation) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setPending(payload);
    sessionStorage.setItem(slot, JSON.stringify(payload));
    try {
      await requestJson(`/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      sessionStorage.removeItem(slot);
      setPending(null);
      setChoice(null);
      setReason('');
      onChanged();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiRequestError && err.status < 500) {
        sessionStorage.removeItem(slot);
        setPending(null);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function mutation(status: OrderStatus, note?: string): Mutation {
    return {
      requestKey: crypto.randomUUID(),
      status,
      expectedStatus: order.status,
      expectedVersion: order.version,
      ...(note ? { reason: note } : {}),
      ...(status === 'RETURNED' ? { restock } : {}),
    };
  }
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
          {!pending && (
            <div className="button-row">
              <button disabled={busy} onClick={onChanged}>
                Обновить карточку
              </button>
            </div>
          )}
        </div>
      )}
      {pending ? (
        <div className="alert" role="status">
          <p>
            {busy
              ? 'Сохраняем изменение…'
              : 'Подтверждение пока не получено. Проверка повторит то же действие без дубля в истории.'}
          </p>
          <div className="button-row">
            <button disabled={busy} onClick={() => void send(pending)}>
              Проверить изменение
            </button>
          </div>
        </div>
      ) : (
        <>
          {!choice && (
            <div className="button-row">
              {choices[order.status].map((action) => (
                <button
                  key={action.status}
                  disabled={busy}
                  className={action.danger ? 'danger' : undefined}
                  onClick={() => {
                    setError('');
                    if (action.reason) {
                      setChoice(action);
                      setReason('');
                      setRestock(false);
                    } else void send(mutation(action.status));
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {choice && (
            <form
              className="workflow-form form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim() && reason.length <= 500)
                  void send(mutation(choice.status, reason.trim()));
              }}
            >
              <h4>{choice.label}</h4>
              {choice.status === 'CANCELLED' && (
                <p className="alert">
                  В доступный остаток вернутся{' '}
                  {order.stockReleased ? 0 : order.quantity} шт. Если продажи на
                  паузе или товар в архиве, они не возобновятся автоматически.
                </p>
              )}
              <div className="field">
                <label htmlFor="order-reason">Причина · обязательно</label>
                <textarea
                  id="order-reason"
                  autoFocus
                  value={reason}
                  maxLength={500}
                  required
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: покупатель передумал, обнаружен брак или статус отмечен ошибочно"
                />
                <span className="muted">
                  {reason.length}/500 · Заметка останется в истории заказа.
                </span>
              </div>
              {choice.status === 'RETURNED' && (
                <>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={restock}
                      disabled={busy}
                      onChange={(e) => setRestock(e.target.checked)}
                    />
                    Вернуть все {order.quantity} шт. в доступный остаток
                  </label>
                  <p className="muted">
                    Отмечайте только если товар уже получен обратно и пригоден
                    для продажи. Для брака оставьте выключенным. Здесь
                    фиксируется возврат всего заказа; деньги согласуйте с
                    покупателем отдельно.
                  </p>
                </>
              )}
              {choice.status === 'CANCELLED' && (
                <p className="muted">
                  Все {order.quantity} шт. вернутся в доступный остаток.
                </p>
              )}
              {order.stockReleased && choice.status !== 'RETURNED' && (
                <p className="muted">
                  Потребуется снова зарезервировать {order.quantity} шт. Если
                  остатка не хватит, изменение не сохранится.
                </p>
              )}
              <div className="button-row">
                <button
                  disabled={busy || !reason.trim() || reason.length > 500}
                >
                  Подтвердить
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setChoice(null)}
                >
                  Не менять
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {order.status === 'RETURNED' && (
        <p className="alert">
          {order.stockReleased
            ? 'Товар возвращён в доступный остаток.'
            : 'Товар не возвращён в доступный остаток.'}{' '}
          Возврат денег сервис не проверяет.
        </p>
      )}
      <OrderHistory key={`${order.id}:${order.version}`} id={order.id} />
    </>
  );
}
