import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl, errorText, publishOffer, requestJson } from '../api/client';
type Listing = {
  id: string;
  title: string;
  status: string;
  product: {
    priceText: string;
    description: string | null;
    images: { fileUrl: string }[];
  };
};
export function ProductsPage() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    requestJson<{ offers: Listing[]; next: string | null }>('/listings')
      .then((data) => {
        if (active) {
          setRows(data.offers);
          setNext(data.next);
        }
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
  }, []);
  async function change(row: Listing, archive = false) {
    if (working.current || loading) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = archive
        ? await requestJson<{ status: string }>(`/offers/${row.id}`, {
            method: 'DELETE',
          })
        : await publishOffer(row.id);
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status: result.status } : item,
        ),
      );
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
    try {
      const data = await requestJson<{
        offers: Listing[];
        next: string | null;
      }>(`/listings?before=${next}`);
      setRows((current) => [...current, ...data.offers]);
      setNext(data.next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel onboarding">
      <p className="eyebrow">Публикации</p>
      <h2>Мои товары</h2>
      <p>
        <Link className="button-link" to="/offers/new">
          Добавить товар
        </Link>
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {loading && <p role="status">Загружаем товары…</p>}
      {!loading && !rows.length && (
        <p>Добавьте первый товар и подготовьте пост.</p>
      )}
      <div className="order-list">
        {rows.map((row) => (
          <article className="order-card" key={row.id}>
            <p className="eyebrow">
              {row.status === 'ACTIVE'
                ? 'Опубликован'
                : row.status === 'ARCHIVED'
                  ? 'Продажа остановлена'
                  : 'Черновик'}
            </p>
            <h3>{row.title}</h3>
            {row.product.images[0] && (
              <img
                className="product-photo"
                src={assetUrl(row.product.images[0].fileUrl)}
                alt={row.title}
              />
            )}
            <p className="price">{row.product.priceText}</p>
            <p className="preserve-lines">{row.product.description}</p>
            <div className="button-row">
              {row.status === 'DRAFT' && (
                <button
                  disabled={busy || loading}
                  onClick={() => {
                    void change(row);
                  }}
                >
                  Опубликовать
                </button>
              )}
              {row.status === 'ACTIVE' && (
                <Link className="button-link" to={`/offers/${row.id}`}>
                  Открыть карточку
                </Link>
              )}
              {row.status !== 'ARCHIVED' && (
                <button
                  disabled={busy || loading}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Остановить приём новых заявок? Старые заказы останутся в списке.',
                      )
                    )
                      void change(row, true);
                  }}
                >
                  Остановить продажу
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {next && (
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
    </section>
  );
}
