import { ProductStock } from '../components/ProductStock';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { assetUrl, errorText, publishOffer, requestJson } from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';

type Listing = {
  id: string;
  title: string;
  status: string;
  publishState: string;
  telegramMessageId: string | null;
  product: {
    id: string;
    title: string;
    description?: string | null;
    priceText: string;
    quantityLimit: number | null;
    reservedQuantity: number;
    images: { fileUrl: string }[];
  };
};
const names: Record<string, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'В продаже',
  PAUSED: 'На паузе',
  ARCHIVED: 'Архив',
};
function stock(row: Listing) {
  return row.product.quantityLimit === null
    ? null
    : Math.max(0, row.product.quantityLimit - row.product.reservedQuantity);
}

function ProductDetails({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const {
    data: row,
    error,
    loading,
    refresh,
  } = useLiveQuery<Listing>(`/listings/${id}`, 0);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  const working = useRef(false);
  async function action(action: string) {
    if (!row || working.current) return;
    if (
      action === 'ARCHIVE' &&
      !window.confirm(
        'Убрать товар в архив? Приём новых заказов прекратится. Заказы сохранятся; товар можно будет восстановить.',
      )
    )
      return;
    working.current = true;
    setBusy(true);
    setFailure('');
    try {
      if (action === 'PUBLISH') await publishOffer(id);
      else
        await requestJson(`/listings/${id}/state`, {
          method: 'POST',
          body: JSON.stringify({ action, expectedStatus: row.status }),
        });
      refresh();
      onChanged();
    } catch (err) {
      setFailure(errorText(err));
      refresh();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const locked =
    busy || ['SENDING', 'UNCERTAIN'].includes(row?.publishState ?? '');
  return (
    <section className="detail-view" aria-label="Подробности товара">
      <div className="button-row">
        <button disabled={busy} onClick={onClose}>
          ← К списку товаров
        </button>
      </div>
      {loading && <p role="status">Загружаем товар…</p>}
      {(error || failure) && (
        <p className="alert error" role="alert">
          {error || failure}
        </p>
      )}
      {row && (
        <>
          <h3>{row.product.title}</h3>
          <span className={`status-pill status-${row.status.toLowerCase()}`}>
            {names[row.status]}
          </span>
          {row.product.images[0] && (
            <img
              className="product-photo"
              src={assetUrl(row.product.images[0].fileUrl)}
              alt={row.product.title}
            />
          )}
          <p className="price">{row.product.priceText}</p>
          <p className="preserve-lines">{row.product.description}</p>
          <ProductStock
            id={row.id}
            onChanged={() => {
              refresh();
              onChanged();
            }}
          />
          <p className="muted">
            {row.status === 'PAUSED'
              ? 'Новые заявки временно отключены. Возобновление сохранит прежнюю ссылку и не отправит новый пост.'
              : row.status === 'ARCHIVED'
                ? 'Заказы сохранены. Восстановление опубликованного товара вернёт его в паузу.'
                : row.status === 'DRAFT'
                  ? 'Товар ещё не опубликован.'
                  : 'Заявки принимаются при наличии остатка. Пауза не отменяет уже полученные заказы.'}
          </p>
          {locked && !busy && (
            <p className="alert">
              Проверьте результат публикации в канале. Повторная отправка
              заблокирована.
            </p>
          )}
          <div className="button-row">
            {row.status === 'DRAFT' && (
              <button disabled={locked} onClick={() => void action('PUBLISH')}>
                Опубликовать в канале
              </button>
            )}
            {row.status === 'ACTIVE' && (
              <button disabled={locked} onClick={() => void action('PAUSE')}>
                Приостановить
              </button>
            )}
            {row.status === 'PAUSED' && (
              <button disabled={locked} onClick={() => void action('RESUME')}>
                Возобновить продажи
              </button>
            )}
            {row.status === 'ARCHIVED' ? (
              <button disabled={locked} onClick={() => void action('RESTORE')}>
                Восстановить
              </button>
            ) : (
              <button
                className="danger"
                disabled={locked}
                onClick={() => void action('ARCHIVE')}
              >
                В архив
              </button>
            )}
          </div>
          <p>
            <Link
              className="contact-link"
              to={`/orders?scope=all&productId=${row.product.id}`}
            >
              Заказы этого товара →
            </Link>
          </p>
          {row.telegramMessageId && (
            <p>
              <Link className="contact-link" to={`/offers/${row.id}?preview=1`}>
                Посмотреть глазами покупателя →
              </Link>
            </p>
          )}
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

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '',
    scope = params.get('scope') ?? 'current';
  const [pages, setPages] = useState(['']),
    [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({
    q,
    scope,
    before: pages[pages.length - 1]!,
  });
  const { data, error, loading, refresh } = useLiveQuery<{
    offers: Listing[];
    next: string | null;
    total: number;
  }>(`/listings?${query}`);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
    setPages(['']);
    setSelected(null);
  }
  return (
    <section className="panel management">
      <p className="eyebrow">Каталог</p>
      <h2>Мои товары</h2>
      {selected ? (
        <ProductDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      ) : (
        <>
          <p>
            <Link className="button-link" to="/offers/new">
              Добавить товар
            </Link>
          </p>
          <div className="search-toolbar">
            <div className="field">
              <label htmlFor="products-search">Найти товар</label>
              <input
                id="products-search"
                type="search"
                maxLength={100}
                value={q}
                placeholder="Название товара"
                onChange={(e) =>
                  change({
                    q: e.target.value,
                    ...(!q.trim() && e.target.value.trim()
                      ? { scope: 'all' }
                      : {}),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="products-scope">Состояние</label>
              <select
                id="products-scope"
                value={scope}
                onChange={(e) => change({ scope: e.target.value })}
              >
                <option value="current">Все, кроме архива</option>
                <option value="all">Все товары</option>
                {Object.entries(names).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => change({ q: '', scope: 'current' })}
              >
                Сбросить фильтры
              </button>
              <button
                className="secondary"
                onClick={refresh}
                disabled={loading}
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
          {!loading && data?.offers.length === 0 && (
            <p>Товары не найдены. Измените поиск или состояние.</p>
          )}
          <div className="compact-list" aria-busy={loading}>
            {data?.offers.map((row) => (
              <button
                className="compact-row product-row"
                key={row.id}
                onClick={() => setSelected(row.id)}
              >
                {row.product.images[0] ? (
                  <img
                    className="list-thumbnail"
                    loading="lazy"
                    src={assetUrl(row.product.images[0].fileUrl)}
                    alt=""
                  />
                ) : (
                  <span
                    className="list-thumbnail empty-thumbnail"
                    aria-hidden="true"
                  >
                    —
                  </span>
                )}
                <span className="row-main">
                  <strong>{row.product.title}</strong>
                  <span>{row.product.priceText}</span>
                </span>
                <span className="row-meta">
                  <span
                    className={`status-pill status-${row.status.toLowerCase()}`}
                  >
                    {names[row.status]}
                  </span>
                  <span className="muted">
                    {stock(row) === 0
                      ? 'Нет в наличии'
                      : stock(row) === null
                        ? 'Без лимита'
                        : `Остаток: ${stock(row)}`}
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
                data?.next && setPages((current) => [...current, data.next!])
              }
            >
              Далее
            </button>
          </div>
        </>
      )}
    </section>
  );
}
