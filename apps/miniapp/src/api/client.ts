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

export async function publishOffer(offerId: string) {
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
export const money = (minor: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
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
  id: string;
  title: string;
  description: string | null;
  priceMinor: number | null;
  imageUrl: string | null;
  available: number | null;
};
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type Order = {
  id: string;
  number: number;
  productTitle: string;
  quantity: number;
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
  orders: Order[];
  next: number | null;
  counts: Partial<Record<OrderStatus, number>>;
};
export const statusNames: Record<OrderStatus, string> = {
  NEW: 'Новый',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнен',
  CANCELLED: 'Отменён',
};
