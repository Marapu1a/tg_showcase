export class ChannelError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function telegramCall<T>(
  token: string,
  method: string,
  body: object = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ChannelError(
      503,
      'Telegram не отвечает. Попробуйте ещё раз чуть позже.',
    );
  }
  let payload: { ok: boolean; result: T };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new ChannelError(
      503,
      'Не удалось получить ответ Telegram. Попробуйте позже.',
    );
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ChannelError(
      503,
      'Telegram временно недоступен. Попробуйте чуть позже.',
    );
  }
  if (!response.ok || !payload.ok) {
    throw new ChannelError(
      400,
      'Не удалось проверить канал. Добавьте бота администратором и проверьте ссылку.',
    );
  }
  return payload.result;
}

export function parseChannelReference(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200)
    throw new ChannelError(400, 'Укажите ссылку или @имя канала.');
  const raw = value.trim();
  if (/^-100\d{5,16}$/.test(raw)) return raw;
  const username = raw.match(
    /^(?:@|https:\/\/t\.me\/)([a-zA-Z][a-zA-Z0-9_]{3,31})\/?$/,
  )?.[1];
  if (!username)
    throw new ChannelError(
      400,
      'Укажите @имя или ссылку https://t.me/канал. Закрытый канал выберите кнопкой Telegram.',
    );
  return `@${username}`;
}

type Member = { status: string; can_post_messages?: boolean };
type Chat = { id: number; type: string; title?: string; username?: string };

export async function verifyChannel(
  token: string,
  reference: string,
  telegramUserId: string,
) {
  const me = await telegramCall<{ id: number; username: string }>(
    token,
    'getMe',
  );
  const chat = await telegramCall<Chat>(token, 'getChat', {
    chat_id: reference,
  });
  if (chat.type !== 'channel')
    throw new ChannelError(400, 'Выберите канал, а не группу или личный чат.');
  const bot = await telegramCall<Member>(token, 'getChatMember', {
    chat_id: chat.id,
    user_id: me.id,
  });
  if (bot.status !== 'administrator' || bot.can_post_messages !== true) {
    throw new ChannelError(
      403,
      'Назначьте бота администратором канала с правом публикации сообщений.',
    );
  }
  const seller = await telegramCall<Member>(token, 'getChatMember', {
    chat_id: chat.id,
    user_id: Number(telegramUserId),
  });
  if (
    seller.status !== 'creator' &&
    !(seller.status === 'administrator' && seller.can_post_messages === true)
  ) {
    throw new ChannelError(
      403,
      'Подключить канал может его владелец или администратор с правом публикации.',
    );
  }
  return {
    channelId: String(chat.id),
    title: chat.title ?? 'Канал',
    username: chat.username ?? null,
    verifiedAt: new Date(),
  };
}
