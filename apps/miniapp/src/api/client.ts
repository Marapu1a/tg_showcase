type ApiError = {
  message: string;
};
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type UserResponse = {
  id: string;
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type ProductResponse = {
  id: string;
};

export type OfferResponse = {
  id: string;
  status: string;
  telegramMessageId?: string | null;
};

function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
  requiresAuth = true,
): Promise<T> {
  const hasBody = init?.body !== undefined;
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData && requiresAuth)
    throw new Error('Откройте приложение через бота, чтобы войти.');
  const headers = {
    ...(initData ? { Authorization: `tma ${initData}` } : {}),
    ...(init?.headers ?? {}),
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(25000),
    headers,
  });

  const payload = (await response.json().catch(() => {
    throw new ApiRequestError(
      'Сервер вернул неполный ответ. Повторите проверку.',
      502,
    );
  })) as T | ApiError;

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload && 'message' in payload
        ? String(payload.message)
        : 'Request failed';
    throw new ApiRequestError(errorMessage, response.status);
  }

  return payload as T;
}

export type TelegramUserPayload = {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export type ProductPayload = {
  ownerUserId: string;
  title: string;
  description?: string;
  priceText: string;
  checkoutUrl?: string;
  quantityLimit?: number | null;
};

export type ProductImagePayload = {
  fileUrl: string;
  sortOrder?: number;
};

export type OfferPayload = {
  productId: string;
  ownerUserId: string;
  title: string;
  text?: string;
};

export async function ensureTelegramUser(payload: TelegramUserPayload) {
  return requestJson<UserResponse>('/users/ensure-telegram-user', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createProduct(payload: ProductPayload) {
  return requestJson<ProductResponse>('/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createProductImage(
  productId: string,
  payload: ProductImagePayload,
) {
  return requestJson(`/products/${productId}/images`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createOffer(payload: OfferPayload) {
  return requestJson<OfferResponse>('/offers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type PublicationQuote = {
  enabled: boolean;
  priceStars: number;
  freeRemaining: number;
  paid: boolean;
  state: string | null;
  published: boolean;
  publishState: string;
  terms: string;
  termsVersion: string;
};
export async function publishOffer(offerId: string) {
  let quote = await requestJson<PublicationQuote>(`/billing/offers/${offerId}`);
  if (quote.published)
    return { id: offerId, status: 'ACTIVE' } as OfferResponse;
  if (quote.enabled && !quote.paid && quote.freeRemaining === 0) {
    if (!window.Telegram?.WebApp?.openInvoice)
      throw new Error('Для оплаты откройте приложение в обновлённом Telegram.');
    if (quote.state === 'REFUND_PENDING')
      throw new Error('Возврат предыдущей оплаты ещё обрабатывается.');
    if (
      !window.confirm(
        `Одно размещение — ${quote.priceStars} ⭐.\n\n${quote.terms}\n\nНажимая «ОК», вы соглашаетесь с этими условиями и переходите к оплате.`,
      )
    )
      throw new Error('Оплата отменена. Товар сохранён в черновиках.');
    const invoice = await requestJson<{
      url?: string;
      paid?: boolean;
      free?: boolean;
    }>(`/billing/offers/${offerId}/invoice`, {
      method: 'POST',
      body: JSON.stringify({
        acceptTerms: true,
        termsVersion: quote.termsVersion,
      }),
    });
    if (invoice.url) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                'Вернитесь к товару и проверьте оплату повторным нажатием «Опубликовать».',
              ),
            ),
          120000,
        );
        window.Telegram!.WebApp!.openInvoice!(invoice.url!, (status) => {
          clearTimeout(timer);
          if (status === 'paid' || status === 'pending') resolve();
          else
            reject(
              new Error('Оплата не подтверждена. Товар сохранён в черновиках.'),
            );
        });
      });
      // The SDK callback is not proof of payment. Only the server ledger is.
      for (let attempt = 0; attempt < 8; attempt++) {
        quote = await requestJson<PublicationQuote>(
          `/billing/offers/${offerId}`,
        );
        if (quote.paid) break;
        if (['REFUND_PENDING', 'REFUNDED'].includes(quote.state ?? ''))
          throw new Error(
            'Оплата возвращается. Проверьте страницу «Оплата сервиса».',
          );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!quote.paid)
        throw new Error(
          'Платёж ещё обрабатывается. Нажмите «Опубликовать» позже: подтверждённая оплата сохранится за товаром.',
        );
    }
  }
  return requestJson<OfferResponse>(`/offers/${offerId}/publish`, {
    method: 'POST',
  });
}

export type ConnectedChannel = {
  channelId: string;
  title: string;
  username: string | null;
  verifiedAt: string;
};
export const getChannel = () =>
  requestJson<{ channel: ConnectedChannel | null }>('/channels');
export const getChannelBot = () =>
  requestJson<{ username: string }>('/channels/bot');
export const connectChannel = (channel: string) =>
  requestJson<{ channel: ConnectedChannel }>('/channels', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  });
export const verifyChannel = () =>
  requestJson<{ channel: ConnectedChannel }>('/channels/verify', {
    method: 'POST',
  });
export const requestChannelButton = () =>
  requestJson<{ id: string }>('/channels/request-button', { method: 'POST' });

export const assetUrl = (path: string) =>
  path.startsWith('/') ? `${getApiBaseUrl()}${path}` : path;
export const money = (minor: number, currency = 'RUB') =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(
    minor / 100,
  );
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'Сервер не ответил вовремя. Повторите проверку.'
      : error.message === 'Failed to fetch'
        ? 'Нет связи с сервером. Попробуйте ещё раз.'
        : error.message
    : 'Не удалось выполнить действие.';
export type PublicOffer = {
  buyerContactUsername?: string | null;
  saleStatus?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  id: string;
  title: string;
  description: string | null;
  priceMinor: number | null;
  currency: string;
  imageUrl: string | null;
  available: number | null;
};
export type OrderStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'CANCELLED'
  | 'RETURNED';
export type Order = {
  version: number;
  stockReleased: boolean;
  id: string;
  number: number;
  productTitle: string;
  quantity: number;
  currency: string;
  unitPriceMinor: number;
  totalMinor: number;
  buyerName: string | null;
  contact: string;
  contactType: string;
  contactVerified: boolean;
  comment: string | null;
  status: OrderStatus;
  createdAt: string;
  notificationState: string;
};
export type OrdersResponse = {
  total: number;
  orders: Pick<
    Order,
    | 'id'
    | 'number'
    | 'productTitle'
    | 'quantity'
    | 'currency'
    | 'totalMinor'
    | 'buyerName'
    | 'contact'
    | 'contactType'
    | 'status'
    | 'createdAt'
  >[];
  next: number | null;
  counts: Partial<Record<OrderStatus, number>>;
};
export const statusNames: Record<OrderStatus, string> = {
  NEW: 'Новый',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнен',
  CANCELLED: 'Отменён',
  RETURNED: 'Возврат',
};
