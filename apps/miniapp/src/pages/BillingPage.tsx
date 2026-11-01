import { Link } from 'react-router-dom';
import { useState } from 'react';
import { requestJson, errorText } from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';
type Payment = {
  offerId: string;
  stars: number;
  state: string;
  createdAt: string;
  offer: {
    title: string;
    publishState: string;
    billing: { state: string } | null;
  };
};
const names: Record<string, string> = {
  PAID: 'Оплачено',
  REFUND_PENDING: 'Возврат обрабатывается',
  REFUNDED: 'Возвращено',
};
export function BillingPage() {
  const config = useLiveQuery<{
    enabled: boolean;
    priceStars: number;
    exempt: boolean;
  }>('/billing/config', 0);
  const { data, error, loading, refresh } = useLiveQuery<{
    payments: Payment[];
  }>('/billing/history', 0);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  return (
    <section className="panel">
      <h2>Оплата сервиса</h2>
      {config.data?.exempt && (
        <p className="alert">
          Аккаунт разработчика: размещения бесплатны, лимит не расходуется.
        </p>
      )}
      <p>
        Первые три размещения бесплатно. Далее — одно размещение за{' '}
        {config.data?.priceStars ?? '…'} ⭐. Без подписок и пакетов. Цена
        подтверждается перед оплатой.
      </p>
      {config.data?.enabled === false && (
        <p className="alert">Приём новых оплат отключён.</p>
      )}
      <p>
        Неизвестный результат публикации сначала проверяем с поддержкой. Оплата
        не означает, что пост уже отправлен.
      </p>
      <p>
        <a href="https://t.me/valentin_marapulets">
          Поддержка по оплате и возвратам
        </a>
      </p>
      <div className="button-row">
        <button disabled={loading || busy} onClick={refresh}>
          Обновить
        </button>
        <Link className="button-link" to="/products">
          К товарам
        </Link>
      </div>
      {(error || failure) && <p role="alert">{error || failure}</p>}
      {loading && <p role="status">Загружаем оплаты…</p>}
      {data?.payments.length === 0 && <p>Оплат пока нет.</p>}
      <ul className="history-list">
        {data?.payments.map((p, i) => (
          <li key={`${p.createdAt}:${i}`}>
            <strong>
              {p.offer.title} · {p.stars} ⭐
            </strong>
            <p>
              {names[p.state] ?? p.state} ·{' '}
              {new Date(p.createdAt).toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
              })}{' '}
              МСК
            </p>
            {p.state === 'PAID' &&
              p.offer.billing?.state === 'PAID' &&
              p.offer.publishState === 'IDLE' && (
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Вернуть оплату за неиспользованное размещение?',
                        )
                      )
                        return;
                      setBusy(true);
                      setFailure('');
                      try {
                        await requestJson(
                          `/billing/offers/${p.offerId}/refund`,
                          { method: 'POST' },
                        );
                        refresh();
                      } catch (e) {
                        setFailure(errorText(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Вернуть оплату
                  </button>
                </div>
              )}
          </li>
        ))}
      </ul>
      <p className="muted">
        Последние 50 оплат. Для более ранних обращайтесь в поддержку.
      </p>
    </section>
  );
}
