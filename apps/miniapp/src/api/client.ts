type ApiError = {
  message: string;
};

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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const headers = {
    ...(init?.headers ?? {}),
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as T | ApiError;

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload && 'message' in payload
        ? String(payload.message)
        : 'Request failed';
    throw new Error(errorMessage);
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
  checkoutUrl: string;
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
  channelId?: string;
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

export async function createProductImage(productId: string, payload: ProductImagePayload) {
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
