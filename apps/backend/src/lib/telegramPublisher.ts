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
  buttons: [TelegramButton, TelegramButton];
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

export async function publishTelegramMessage(
  input: TelegramPublishInput,
): Promise<TelegramSendMessageResult> {
  const response = await fetch(
    `https://api.telegram.org/bot${input.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: input.channelId,
        text: input.text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: input.buttons[0].text, url: input.buttons[0].url },
              { text: input.buttons[1].text, url: input.buttons[1].url },
            ],
          ],
        },
      }),
    },
  );

  const payload = (await response.json()) as TelegramApiResponse;

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description ?? 'Telegram API error');
  }

  return {
    messageId: String(payload.result.message_id),
    channelId: String(payload.result.chat?.id ?? input.channelId),
  };
}
