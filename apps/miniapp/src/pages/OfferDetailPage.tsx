import { FormEvent, useEffect, useRef, useState } from 'react';
import { contactError, quantityError } from '../lib/validation';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  PublicOffer,
  ApiRequestError,
  assetUrl,
  errorText,
  money,
  requestJson,
} from '../api/client';

function OfferDetailContent() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1';
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => {
    if (preview) return null;
    try {
      return JSON.parse(
        sessionStorage.getItem(`order-pending:${id}`) ?? 'null',
      );
    } catch {
      return null;
    }
  });
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(String(pending?.quantity ?? '1'));
  const submitting = useRef(false);
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const [contactType, setContactType] = useState(
    String(pending?.contactType ?? 'TELEGRAM'),
  );
  const [contact, setContact] = useState(
    String(pending?.contact ?? (user?.username ? `@${user.username}` : '')),
  );
  const [comment, setComment] = useState(String(pending?.comment ?? ''));
  const [busy, setBusy] = useState(false);
  const maxQuantity = Math.min(
    99,
    offer?.available ?? 99,
    offer?.priceMinor ? Math.floor(2147483647 / offer.priceMinor) : 99,
  );
  const quantityIssue = quantityError(quantity, maxQuantity);
  const contactIssue = contactError(contactType, contact);
  const valid = !quantityIssue && !contactIssue && comment.length <= 500;
  const [result, setResult] = useState<{
    number: number;
    quantity: number;
    productTitle?: string;
    totalMinor?: number;
    currency?: string;
    buyerContactUsername?: string | null;
  } | null>(() => {
    if (preview) return null;
    try {
      return JSON.parse(
        sessionStorage.getItem(`order-receipt:${id}`) ?? 'null',
      );
    } catch {
      return null;
    }
  });
  const [key, setKey] = useState(() => {
    const slot = `order-request:${id}`;
    const old = sessionStorage.getItem(slot);
    if (old) return old;
    const next = crypto.randomUUID();
    sessionStorage.setItem(slot, next);
    return next;
  });
  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    let active = true;
    requestJson<PublicOffer>(`/public/offers/${id}`, undefined, false)
      .then((data) => {
        if (active) setOffer(data);
      })
      .catch((err) => {
        if (active) {
          setError(errorText(err));
          // An already accepted request remains recoverable even if the sale closed.
          if (pending)
            setOffer({
              id: String(id),
              title: 'Заявка на товар',
              description: null,
              imageUrl: null,
              available: null,
              priceMinor: Number(pending.unitPriceMinor),
              currency: String(pending.currency ?? 'RUB'),
            });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, pending]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      preview ||
      !offer ||
      (!pending &&
        (!valid ||
          offer.available === 0 ||
          (offer.saleStatus && offer.saleStatus !== 'ACTIVE'))) ||
      submitting.current
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const payload = pending ?? {
      requestKey: key,
      quantity: Number(quantity),
      unitPriceMinor: offer.priceMinor,
      currency: offer.currency,
      contactType,
      contact,
      comment,
    };
    try {
      sessionStorage.setItem(`order-pending:${id}`, JSON.stringify(payload));
      setPending(payload);
      const receipt = await requestJson<{
        number: number;
        quantity: number;
        productTitle: string;
        totalMinor: number;
        buyerContactUsername: string | null;
      }>(
        `/public/offers/${id}/orders`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        false,
      );
      const confirmed = receipt;
      sessionStorage.setItem(`order-receipt:${id}`, JSON.stringify(confirmed));
      setResult(confirmed);
      sessionStorage.removeItem(`order-pending:${id}`);
      setPending(null);
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiRequestError && err.status < 500) {
        sessionStorage.removeItem(`order-pending:${id}`);
        setPending(null);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="panel onboarding">
        <p role="status">Загружаем товар…</p>
      </section>
    );
  if (!offer && !result)
    return (
      <section className="panel onboarding">
        <h2>Товар недоступен</h2>
        <p role="alert">{error}</p>
      </section>
    );
  if (result)
    return (
      <section className="panel onboarding">
        <p className="eyebrow">Заявка №{result.number}</p>
        <h2>Заказ отправлен</h2>
        <p>
          Продавец свяжется с вами для согласования оплаты и получения товара.
        </p>
        <p>
          {result.productTitle ?? offer?.title} · {result.quantity} шт.
        </p>
        {result.totalMinor !== undefined && (
          <p className="price">
            Итого: {money(result.totalMinor, result.currency)}
          </p>
        )}
        <p>Вы ничего не оплатили через сервис.</p>
        <p>
          Сохраните номер заказа или сделайте снимок этого экрана — по номеру
          продавец быстрее найдёт вашу заявку.
        </p>
        {result.buyerContactUsername && (
          <p>
            <a
              className="button-link"
              href={`https://t.me/${result.buyerContactUsername}`}
            >
              Связаться с продавцом
            </a>
          </p>
        )}
        <div className="button-row">
          <button
            onClick={() => {
              const next = crypto.randomUUID();
              sessionStorage.setItem(`order-request:${id}`, next);
              sessionStorage.removeItem(`order-receipt:${id}`);
              setKey(next);
              setResult(null);
              window.location.reload();
            }}
          >
            Оформить ещё один заказ
          </button>
        </div>
      </section>
    );
  if (!offer) return null;
  const unavailable =
    !pending &&
    (!offer.priceMinor ||
      offer.available === 0 ||
      (offer.saleStatus && offer.saleStatus !== 'ACTIVE'));
  return (
    <section className="panel onboarding">
      {offer.imageUrl && (
        <img
          className="product-photo"
          src={assetUrl(offer.imageUrl)}
          alt={offer.title}
        />
      )}
      <h2>{offer.title}</h2>
      <p className="price">
        {offer.priceMinor
          ? `${money(offer.priceMinor, offer.currency)} / шт.`
          : 'Цена уточняется'}
      </p>
      <p className="preserve-lines">{offer.description}</p>
      {offer.available !== null && <p>Доступно: {offer.available} шт.</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
          <p>
            <button type="button" onClick={() => window.location.reload()}>
              Обновить карточку
            </button>
          </p>
        </div>
      )}
      {pending && !busy && (
        <p className="alert" role="status">
          Результат отправки пока не подтверждён. Нажмите «Проверить отправку»:
          повтор использует те же данные и не создаст второй заказ.
        </p>
      )}
      {unavailable ? (
        <p className="alert" role="status">
          {offer.saleStatus === 'PAUSED'
            ? 'Приём заказов временно приостановлен.'
            : offer.saleStatus === 'ARCHIVED'
              ? 'Продажа завершена.'
              : offer.available === 0
                ? 'Нет в наличии.'
                : 'Сейчас заявки на этот товар не принимаются.'}
        </p>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="field">
            <label htmlFor="order-quantity">Количество</label>
            <input
              id="order-quantity"
              type="text"
              inputMode="numeric"
              maxLength={6}
              min={1}
              max={maxQuantity}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={Boolean(quantityIssue)}
              aria-describedby="quantity-hint"
              required
              disabled={busy || Boolean(pending)}
            />
            <span
              id="quantity-hint"
              className={quantityIssue ? 'field-error' : 'muted'}
              aria-live="polite"
            >
              {quantityIssue || `От 1 до ${maxQuantity} шт. на заявку.`}
            </span>
          </div>
          <p className="price">
            Итого:{' '}
            {quantityIssue
              ? '—'
              : money(offer.priceMinor! * Number(quantity), offer.currency)}
          </p>
          <div className="field">
            <label htmlFor="contact-type">Как с вами связаться?</label>
            <select
              id="contact-type"
              value={contactType}
              disabled={busy || Boolean(pending)}
              onChange={(e) => {
                setContactType(e.target.value);
                setContact(
                  e.target.value === 'TELEGRAM' && user?.username
                    ? `@${user.username}`
                    : '',
                );
              }}
            >
              <option value="TELEGRAM">Telegram</option>
              <option value="PHONE">Телефон</option>
              <option value="OTHER">Другой способ</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="contact">
              {contactType === 'TELEGRAM'
                ? 'Ваше @имя в Telegram'
                : contactType === 'PHONE'
                  ? 'Номер телефона'
                  : 'Контакт для связи'}
            </label>
            <input
              id="contact"
              type={contactType === 'PHONE' ? 'tel' : 'text'}
              autoComplete={contactType === 'PHONE' ? 'tel' : 'off'}
              aria-invalid={Boolean(contact && contactIssue)}
              aria-describedby="contact-hint"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={
                contactType === 'TELEGRAM'
                  ? 33
                  : contactType === 'PHONE'
                    ? 25
                    : 160
              }
              required
              disabled={busy || Boolean(pending)}
              readOnly={
                contactType === 'TELEGRAM' &&
                Boolean(user?.username && window.Telegram?.WebApp?.initData)
              }
              placeholder={
                contactType === 'TELEGRAM'
                  ? '@username'
                  : contactType === 'PHONE'
                    ? '+7…'
                    : 'Например, адрес электронной почты'
              }
            />
            <span
              id="contact-hint"
              className={contact && contactIssue ? 'field-error' : 'muted'}
              aria-live="polite"
            >
              {contactIssue}
            </span>
            {contactType === 'TELEGRAM' && (
              <span className="muted">
                Если у вас нет @имени или сообщения от незнакомых закрыты,
                выберите другой способ.
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="comment">Комментарий · необязательно</label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              disabled={busy || Boolean(pending)}
              placeholder="Например, нужный цвет"
            />
            <span className="muted">{comment.length}/500</span>
          </div>
          <div className="alert">
            Сейчас платить не нужно. Оплату и получение согласуете с продавцом.
          </div>
          <p className="muted">
            Отправляя заявку, вы передаёте указанный контакт и комментарий
            продавцу для связи по заказу.
          </p>
          <div className="button-row">
            <button disabled={preview || busy || (!pending && !valid)}>
              {preview
                ? 'Предпросмотр — отправка отключена'
                : busy
                  ? 'Отправляем…'
                  : pending
                    ? 'Проверить отправку'
                    : 'Отправить заказ'}
            </button>
          </div>
          <p className="muted">
            Отправляя заявку, вы принимаете{' '}
            <Link to="/terms">условия сервиса</Link>. Контакт и данные заказа
            будут переданы продавцу.{' '}
            <Link to="/privacy">Как мы обрабатываем данные</Link>.
          </p>
        </form>
      )}
    </section>
  );
}

export function OfferDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1';
  return (
    <>
      {preview && (
        <section className="panel" aria-label="Предпросмотр товара">
          <strong>Так товар видят покупатели</strong>
          <p>
            Это предпросмотр. Можно заполнить форму, но заказ не будет
            отправлен.
          </p>
          <Link className="button-link" to="/products">
            ← Вернуться к товарам
          </Link>
        </section>
      )}
      <OfferDetailContent key={`${id}:${preview}`} />
    </>
  );
}
