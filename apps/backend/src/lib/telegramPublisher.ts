type TelegramSendMessageResult = {
  messageId: string;
  channelId: string;
};

type TelegramButton = {
  text: string;
  url: string;
};

type TelegramPublishInput = {
  botToken: string;
  channelId: string;
  text: string;
  buttons: TelegramButton[];
  parseMode?: 'HTML';
};

type TelegramPublishPhotoInput = TelegramPublishInput & {
  photoUrl: string;
};

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id: number;
    chat?: {
      id?: number;
    };
  };
};

export class TelegramPublishRejected extends Error {}

async function callTelegramApi(
  botToken: string,
  method: 'sendMessage' | 'sendPhoto',
  body: Record<string, unknown>,
): Promise<TelegramSendMessageResult> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );

  const payload = (await response.json()) as TelegramApiResponse;

  if (!response.ok || !payload.ok || !payload.result) {
    if (payload.ok === false)
      throw new TelegramPublishRejected(
        payload.description ?? 'Telegram API error',
      );
    throw new Error('Не получено подтверждение публикации. Проверьте канал.');
  }

  return {
    messageId: String(payload.result.message_id),
    channelId: String(payload.result.chat?.id ?? String(body.chat_id)),
  };
}

export async function publishTelegramMessage(
  input: TelegramPublishInput,
): Promise<TelegramSendMessageResult> {
  const [primary, secondary] = input.buttons;

  if (!primary || !secondary) {
    throw new Error('Two buttons are required');
  }

  return callTelegramApi(input.botToken, 'sendMessage', {
    chat_id: input.channelId,
    text: input.text,
    parse_mode: input.parseMode,
    reply_markup: {
      inline_keyboard: [
        [
          { text: primary.text, url: primary.url },
          { text: secondary.text, url: secondary.url },
        ],
      ],
    },
  });
}

export async function publishTelegramPhoto(
  input: TelegramPublishPhotoInput,
): Promise<TelegramSendMessageResult> {
  const [primary, secondary] = input.buttons;

  if (!primary || !secondary) {
    throw new Error('Two buttons are required');
  }

  return callTelegramApi(input.botToken, 'sendPhoto', {
    chat_id: input.channelId,
    photo: input.photoUrl,
    caption: input.text,
    parse_mode: input.parseMode,
    reply_markup: {
      inline_keyboard: [
        [
          { text: primary.text, url: primary.url },
          { text: secondary.text, url: secondary.url },
        ],
      ],
    },
  });
}
