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

async function callTelegramApi(
  botToken: string,
  method: 'sendMessage' | 'sendPhoto',
  body: Record<string, unknown>,
): Promise<TelegramSendMessageResult> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TelegramApiResponse;

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description ?? 'Telegram API error');
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
