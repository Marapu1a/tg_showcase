import { useRef, useState } from 'react';
import { ApiRequestError, errorText, requestJson } from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';

type Addition = { requestKey: string; quantity: number; note: string };
type Stock = {
  total: number | null;
  reserved: number;
  sold: number;
  available: number | null;
  withheldReturns: number;
  returnedToStock: number;
  discrepancy: number;
  additions: {
    id: string;
    quantity: number;
    note: string | null;
    createdAt: string;
  }[];
};
export function ProductStock({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const { data, error, loading, refresh } = useLiveQuery<Stock>(
    `/listings/${id}/stock`,
    0,
  );
  const slot = `stock-addition:${id}`;
  const [pending, setPending] = useState<Addition | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(slot) ?? 'null');
    } catch {
      return null;
    }
  });
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const valid =
    /^\d{1,6}$/.test(quantity) &&
    Number(quantity) > 0 &&
    Number(quantity) <= 100000 &&
    data?.total !== null &&
    (data?.total ?? 0) + Number(quantity) <= 100000 &&
    note.length <= 300;
  async function send() {
    if (working.current || (!pending && !valid)) return;
    const payload = pending ?? {
      requestKey: crypto.randomUUID(),
      quantity: Number(quantity),
      note,
    };
    working.current = true;
    setBusy(true);
    setFailure('');
    setSuccess('');
    try {
      sessionStorage.setItem(slot, JSON.stringify(payload));
      setPending(payload);
      await requestJson(`/listings/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      sessionStorage.removeItem(slot);
      setPending(null);
      setQuantity('');
      setNote('');
      setSuccess(`Пополнение учтено: ${payload.quantity} шт.`);
      refresh();
      onChanged();
    } catch (err) {
      setFailure(errorText(err));
      if (err instanceof ApiRequestError && err.status < 500) {
        sessionStorage.removeItem(slot);
        setPending(null);
        refresh();
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Остатки товара">
      <h4>Остатки</h4>
      {loading && <p role="status">Загружаем остатки…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={refresh}>Повторить</button>
        </p>
      )}
      {data && (
        <>
          <dl className="stock-breakdown">
            <dt>Всего с учётом пополнений</dt>
            <dd>{data.total ?? 'Без ограничения'}</dd>
            <dt>В новых заказах и в работе</dt>
            <dd>{data.reserved} шт.</dd>
            <dt>Продано — выполненные заказы</dt>
            <dd>{data.sold} шт.</dd>
            <dt>Возвраты вне продажи</dt>
            <dd>{data.withheldReturns} шт.</dd>
            <dt>Доступно</dt>
            <dd>
              {data.available ?? 'Без ограничения'}
              {data.available !== null ? ' шт.' : ''}
            </dd>
          </dl>
          <p className="muted">
            Возвраты вне продажи, например брак, не входят в доступный остаток.
            Возвраты с возвратом в продажу ({data.returnedToStock} шт.) уже
            учтены в доступном количестве. «Продано» — отметка продавца, не
            подтверждение оплаты.
          </p>
          {data.discrepancy !== 0 && (
            <p role="alert" className="alert error">
              Расхождение учёта: {data.discrepancy} шт. Требуется проверка
              истории товара.
            </p>
          )}
          {data.total !== null && (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <h4>Пополнить товар</h4>
              <div className="field">
                <label htmlFor="stock-quantity">Сколько добавить, шт.</label>
                <input
                  id="stock-quantity"
                  inputMode="numeric"
                  maxLength={6}
                  value={quantity}
                  disabled={busy || Boolean(pending)}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <span className="muted">
                  Целое число от 1 до {Math.max(0, 100000 - data.total)}. Уже
                  принятые заказы не изменятся. Пауза и архив сохранятся.
                </span>
              </div>
              <div className="field">
                <label htmlFor="stock-note">Примечание — необязательно</label>
                <textarea
                  id="stock-note"
                  maxLength={300}
                  value={note}
                  disabled={busy || Boolean(pending)}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <div className="button-row">
                <button disabled={busy || (!pending && !valid)}>
                  {busy
                    ? 'Сохраняем…'
                    : pending
                      ? 'Проверить пополнение'
                      : 'Добавить в остаток'}
                </button>
              </div>
            </form>
          )}
          {data.additions.length > 0 && (
            <details>
              <summary>Последние 10 пополнений</summary>
              <ul>
                {data.additions.map((entry) => (
                  <li key={entry.id}>
                    +{entry.quantity} шт. ·{' '}
                    {new Date(entry.createdAt).toLocaleString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                    })}{' '}
                    МСК
                    {entry.note && (
                      <p className="preserve-lines">{entry.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {pending && (
        <p role="status">
          Ответ о пополнении не подтверждён. Повторная проверка не добавит товар
          дважды.
        </p>
      )}
      {failure && (
        <p role="alert" className="alert error">
          {failure}
        </p>
      )}
      {success && <p role="status">{success}</p>}
    </section>
  );
}
