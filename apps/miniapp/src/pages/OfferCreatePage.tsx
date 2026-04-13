import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  createOffer,
  createProduct,
  createProductImage,
  ensureTelegramUser,
  publishOffer,
} from '../api/client';

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: TelegramUser;
        };
        ready?: () => void;
      };
    };
  }
}

type SubmitResult = {
  productId: string;
  offerId: string;
  offerStatus: string;
  published: boolean;
  telegramMessageId?: string | null;
};

function getTelegramUser(): TelegramUser | undefined {
  return window.Telegram?.WebApp?.initDataUnsafe?.user;
}

function isNonEmptyString(value: string) {
  return value.trim().length > 0;
}

function parsePositiveInt(value: string): number | null {
  if (!value.trim()) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) return NaN;
  return num;
}

export function OfferCreatePage() {
  const telegramUser = getTelegramUser();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const [productTitle, setProductTitle] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [quantityLimit, setQuantityLimit] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerText, setOfferText] = useState('');
  const [channelId, setChannelId] = useState('');

  const [devTelegramUserId, setDevTelegramUserId] = useState(
    searchParams.get('devUserId') ?? '',
  );
  const [devUsername, setDevUsername] = useState(searchParams.get('devUsername') ?? '');
  const [devFirstName, setDevFirstName] = useState(
    searchParams.get('devFirstName') ?? '',
  );
  const [devLastName, setDevLastName] = useState(searchParams.get('devLastName') ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  async function submitFlow(publish: boolean) {
    setError(null);
    setResult(null);

    if (!isNonEmptyString(productTitle)) {
      setError('Введите название товара.');
      return;
    }
    if (!isNonEmptyString(priceText)) {
      setError('Введите цену товара.');
      return;
    }
    if (!isNonEmptyString(checkoutUrl)) {
      setError('Введите ссылку на оплату.');
      return;
    }
    if (!isNonEmptyString(offerTitle)) {
      setError('Введите заголовок офера.');
      return;
    }

    if (imageUrl && !isNonEmptyString(imageUrl)) {
      setError('Ссылка на картинку не должна быть пустой.');
      return;
    }

    const parsedQuantity = parsePositiveInt(quantityLimit);
    if (parsedQuantity !== null && Number.isNaN(parsedQuantity)) {
      setError('Лимит количества должен быть положительным целым числом.');
      return;
    }

    const tgUser = telegramUser;
    if (!tgUser && !isNonEmptyString(devTelegramUserId)) {
      setError('Telegram user недоступен. Укажите devUserId.');
      return;
    }

    const ownerPayload = tgUser
      ? {
          telegramUserId: String(tgUser.id),
          username: tgUser.username,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
        }
      : {
          telegramUserId: devTelegramUserId.trim(),
          username: devUsername.trim() || undefined,
          firstName: devFirstName.trim() || undefined,
          lastName: devLastName.trim() || undefined,
        };

    setIsSubmitting(true);

    try {
      let step = 'ensure user';
      const owner = await ensureTelegramUser(ownerPayload);

      step = 'create product';
      const product = await createProduct({
        ownerUserId: owner.id,
        title: productTitle.trim(),
        description: productDescription.trim() || undefined,
        priceText: priceText.trim(),
        checkoutUrl: checkoutUrl.trim(),
        quantityLimit: parsedQuantity === null ? undefined : parsedQuantity,
      });

      if (imageUrl.trim()) {
        step = 'create product image';
        await createProductImage(product.id, {
          fileUrl: imageUrl.trim(),
        });
      }

      step = 'create offer';
      const offer = await createOffer({
        productId: product.id,
        ownerUserId: owner.id,
        title: offerTitle.trim(),
        text: offerText.trim() || undefined,
        channelId: channelId.trim() || undefined,
      });

      let published = false;
      let publishedOffer = offer;

      if (publish) {
        step = 'publish offer';
        publishedOffer = await publishOffer(offer.id);
        published = true;
      }

      setResult({
        productId: product.id,
        offerId: offer.id,
        offerStatus: publishedOffer.status ?? offer.status,
        telegramMessageId: publishedOffer.telegramMessageId ?? null,
        published,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка запроса';
      if (message === 'Failed to fetch') {
        setError(
          `Failed to fetch. Проверьте доступность API (${import.meta.env.VITE_API_URL}) и CORS.`,
        );
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    void submitFlow(false);
  };

  const onPublish = (event: FormEvent) => {
    event.preventDefault();
    void submitFlow(true);
  };

  useEffect(() => {
    async function checkHealth() {
      try {
        const base = import.meta.env.VITE_API_URL;
        const response = await fetch(`${base}/health`);
        if (!response.ok) {
          setHealthStatus(`health ${response.status}`);
          return;
        }
        setHealthStatus('health ok');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'health failed';
        setHealthError(message);
      }
    }

    void checkHealth();
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">Create Offer</p>
      <h2>Новый офер</h2>
      <p>Заполните данные товара и офера, затем сохраните или сразу опубликуйте.</p>

      <div className="alert">
        <p>API: {import.meta.env.VITE_API_URL}</p>
        {healthStatus && <p>{healthStatus}</p>}
        {healthError && <p>health error: {healthError}</p>}
      </div>

      <form className="form-stack" onSubmit={onSave}>
        <div className="form-grid">
          <div className="field">
            <label>Название товара *</label>
            <input
              value={productTitle}
              onChange={(event) => setProductTitle(event.target.value)}
              placeholder="Например: Умный термос 500 мл"
              required
            />
          </div>
          <div className="field">
            <label>Описание товара</label>
            <textarea
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Коротко о товаре"
            />
          </div>
          <div className="field">
            <label>Цена *</label>
            <input
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
              placeholder="1490 ₽"
              required
            />
          </div>
          <div className="field">
            <label>Checkout URL *</label>
            <input
              value={checkoutUrl}
              onChange={(event) => setCheckoutUrl(event.target.value)}
              placeholder="https://pay.example.com/checkout"
              required
            />
          </div>
          <div className="field">
            <label>Image URL</label>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://cdn.example.com/image.jpg"
            />
          </div>
          <div className="field">
            <label>Лимит количества</label>
            <input
              value={quantityLimit}
              onChange={(event) => setQuantityLimit(event.target.value)}
              placeholder="10"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Заголовок офера *</label>
            <input
              value={offerTitle}
              onChange={(event) => setOfferTitle(event.target.value)}
              placeholder="Офер: умный термос для путешествий"
              required
            />
          </div>
          <div className="field">
            <label>Текст офера</label>
            <textarea
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              placeholder="Короткий текст предложения"
            />
          </div>
          <div className="field">
            <label>Channel ID (optional)</label>
            <input
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              placeholder="@channel или -100..."
            />
          </div>
        </div>

        {import.meta.env.DEV && !telegramUser && (
          <div className="dev-box">
            <p>Dev fallback: Telegram user недоступен.</p>
            <div className="form-grid">
              <div className="field">
                <label>Dev Telegram User ID *</label>
                <input
                  value={devTelegramUserId}
                  onChange={(event) => setDevTelegramUserId(event.target.value)}
                  placeholder="123456789"
                />
              </div>
              <div className="field">
                <label>Username</label>
                <input
                  value={devUsername}
                  onChange={(event) => setDevUsername(event.target.value)}
                  placeholder="username"
                />
              </div>
              <div className="field">
                <label>First name</label>
                <input
                  value={devFirstName}
                  onChange={(event) => setDevFirstName(event.target.value)}
                  placeholder="Имя"
                />
              </div>
              <div className="field">
                <label>Last name</label>
                <input
                  value={devLastName}
                  onChange={(event) => setDevLastName(event.target.value)}
                  placeholder="Фамилия"
                />
              </div>
            </div>
          </div>
        )}

        {error && <div className="alert error">{error}</div>}

        {result && (
          <div className="alert success">
            <p>Готово: продукт создан, офер создан.</p>
            <p>Product ID: {result.productId}</p>
            <p>Offer ID: {result.offerId}</p>
            <p>Статус: {result.offerStatus}</p>
            <p>Опубликован: {result.published ? 'да' : 'нет'}</p>
            {result.telegramMessageId && (
              <p>Telegram message id: {result.telegramMessageId}</p>
            )}
            <p>
              Ссылка: <a href={`/offers/${result.offerId}`}>/offers/{result.offerId}</a>
            </p>
          </div>
        )}

        <div className="button-row">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Сохраняем...' : 'Сохранить офер'}
          </button>
          <button type="button" onClick={onPublish} disabled={isSubmitting}>
            {isSubmitting ? 'Публикуем...' : 'Создать и опубликовать'}
          </button>
        </div>
      </form>
    </section>
  );
}
