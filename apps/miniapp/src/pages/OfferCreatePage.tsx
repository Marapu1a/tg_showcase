import { FormEvent, useEffect, useRef, useState } from 'react';
import { priceError, quantityError } from '../lib/validation';
import { Link } from 'react-router-dom';
import {
  ApiRequestError,
  assetUrl,
  errorText,
  money,
  publishOffer,
  requestJson,
} from '../api/client';

export function OfferCreatePage() {
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('listing-pending') ?? 'null');
    } catch {
      return null;
    }
  });
  const [title, setTitle] = useState(String(pending?.title ?? ''));
  const [description, setDescription] = useState(
    String(pending?.description ?? ''),
  );
  const [price, setPrice] = useState(String(pending?.price ?? ''));
  const [quantity, setQuantity] = useState(
    String(pending?.quantityLimit ?? ''),
  );
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(
    pending?.photoId
      ? {
          id: String(pending.photoId),
          url: '/media/' + String(pending.photoId),
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ id: string; status: string } | null>(
    null,
  );
  const key = useRef(String(pending?.requestKey ?? crypto.randomUUID()));
  const working = useRef(false);
  const priceIssue = priceError(price);
  const quantityIssue = quantity ? quantityError(quantity, 100000) : '';
  const valid =
    title.trim().length > 0 &&
    title.length <= 100 &&
    description.length <= 700 &&
    !priceIssue &&
    !quantityIssue;
  const authorized = Boolean(window.Telegram?.WebApp?.initData);
  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
  }, []);
  async function upload(file?: File) {
    if (!file || working.current || pending || !authorized) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Выберите JPEG, PNG или WebP.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Выберите фото размером до 4 МБ.');
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Не удалось прочитать фото.'));
        reader.readAsDataURL(file);
      });
      setPhoto(
        await requestJson('/listings/photo', {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        }),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (working.current || !authorized || (!valid && !pending)) return;
    const payload = pending ?? {
      requestKey: key.current,
      title,
      description,
      price,
      photoId: photo?.id,
      quantityLimit: quantity ? Number(quantity) : null,
    };
    sessionStorage.setItem('listing-pending', JSON.stringify(payload));
    setPending(payload);
    working.current = true;
    setBusy(true);
    setError('');
    try {
      setSaved(
        await requestJson('/listings', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
      sessionStorage.removeItem('listing-pending');
      setPending(null);
    } catch (err) {
      if (!pending && err instanceof ApiRequestError && err.status < 500) {
        sessionStorage.removeItem('listing-pending');
        setPending(null);
      }
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function publish() {
    if (!saved || working.current || !authorized) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await publishOffer(saved.id);
      setSaved({ id: saved.id, status: result.status });
    } catch (err) {
      setError(errorText(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel onboarding">
      <p className="eyebrow">
        {saved ? 'Предпросмотр публикации' : 'Ваш товар'}
      </p>
      <h2>{saved ? title : 'Новый товар'}</h2>
      {!window.Telegram?.WebApp?.initData && (
        <p className="alert">Для сохранения откройте приложение через бота.</p>
      )}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {pending && !busy && (
        <p className="alert" role="status">
          Подтверждение сохранения не получено. Повторная проверка использует те
          же данные и не создаёт второй товар.
        </p>
      )}
      {saved ? (
        <>
          {photo && (
            <img
              className="product-photo"
              src={assetUrl(photo.url)}
              alt={title}
            />
          )}
          <p className="price">
            {money(Math.round(Number(price.replace(',', '.')) * 100))}
          </p>
          <p className="preserve-lines">{description}</p>
          <p>
            Покупатель оставит заявку. Оплату и получение вы согласуете лично.
          </p>
          {saved.status === 'ACTIVE' ? (
            <div className="alert success">
              Опубликовано.{' '}
              <Link to={`/offers/${saved.id}`}>
                Открыть карточку покупателя →
              </Link>
            </div>
          ) : (
            <>
              <p>
                Черновик сохранён. Пост будет отправлен в ваш подключённый
                канал.
              </p>
              <div className="button-row">
                <button
                  disabled={busy || Boolean(pending) || !authorized}
                  onClick={() => {
                    void publish();
                  }}
                >
                  {busy ? 'Публикуем…' : 'Опубликовать в канале'}
                </button>
              </div>
            </>
          )}
          <p>
            <Link to="/products">К моим товарам →</Link>
          </p>
        </>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <div className="field">
            <label htmlFor="photo">Фото</label>
            <input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || Boolean(pending) || !authorized}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <span className="muted">JPEG, PNG или WebP, до 4 МБ</span>
            {photo && (
              <>
                <img
                  className="product-photo"
                  src={assetUrl(photo.url)}
                  alt="Выбранное фото"
                />
                <div className="button-row">
                  <button
                    type="button"
                    disabled={busy || Boolean(pending) || !authorized}
                    onClick={() => setPhoto(null)}
                  >
                    Убрать фото
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor="title">Название</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              disabled={busy || Boolean(pending) || !authorized}
              placeholder="Шерстяные носки"
            />
            <span className="muted">{title.length}/100</span>
          </div>
          <div className="field">
            <label htmlFor="price">Цена за штуку, ₽</label>
            <input
              id="price"
              maxLength={9}
              aria-invalid={Boolean(price && priceIssue)}
              aria-describedby="price-hint"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              required
              disabled={busy || Boolean(pending) || !authorized}
              placeholder="600"
            />
            <span
              id="price-hint"
              className={price && priceIssue ? 'field-error' : 'muted'}
            >
              {priceIssue}
            </span>
          </div>
          <div className="field">
            <label htmlFor="description">Описание · необязательно</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={700}
              disabled={busy || Boolean(pending) || !authorized}
              placeholder="Размер, материал и другие детали"
            />
          </div>
          <div className="field">
            <label htmlFor="quantity">
              Количество в наличии · необязательно
            </label>
            <input
              id="quantity"
              type="text"
              inputMode="numeric"
              maxLength={6}
              aria-invalid={Boolean(quantityIssue)}
              aria-describedby="stock-hint"
              min={1}
              max={100000}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy || Boolean(pending) || !authorized}
              placeholder="Без ограничения"
            />
            <span id="stock-hint" className="field-error">
              {quantityIssue}
            </span>
            <span className="muted">
              Заявка занимает указанное количество. Отмена возвращает его в
              доступные.
            </span>
          </div>
          <div className="button-row">
            <button disabled={busy || !authorized || (!pending && !valid)}>
              {busy
                ? 'Сохраняем…'
                : pending
                  ? 'Проверить сохранение'
                  : 'Сохранить и посмотреть пост'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
