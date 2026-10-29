import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { formatMoney } from '../../lib/input.js';
import { telegramCall } from '../../lib/telegramChannels.js';

export async function deliverOrderNotifications() {
  if (!env.TELEGRAM_BOT_TOKEN || !env.MINI_APP_PUBLIC_URL) return;
  const due = await prisma.orderRequest.findMany({
    where: {
      notificationState: { in: ['PENDING', 'SENDING'] },
      notificationNextAt: { lte: new Date() },
    },
    take: 10,
    orderBy: { notificationNextAt: 'asc' },
    include: { ownerUser: { select: { telegramUserId: true } } },
  });
  for (const order of due) {
    const claimed = await prisma.orderRequest.updateMany({
      where: {
        id: order.id,
        notificationState: order.notificationState,
        notificationNextAt: order.notificationNextAt,
      },
      data: {
        notificationState: 'SENDING',
        notificationAttempts: { increment: 1 },
        notificationNextAt: new Date(Date.now() + 120000),
      },
    });
    if (!claimed.count) continue;
    try {
      await telegramCall(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: order.ownerUser.telegramUserId,
        text: [
          `Новый заказ №${order.number}`,
          `${order.productTitle} — ${order.quantity} шт.`,
          `Итого: ${formatMoney(order.totalMinor)}`,
          `Контакт: ${order.contact}`,
          order.buyerName ? `Покупатель: ${order.buyerName}` : '',
          order.comment ? `Комментарий: ${order.comment}` : '',
          'Оплату и получение согласуйте с покупателем.',
        ]
          .filter(Boolean)
          .join('\n'),
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Открыть заказы',
                web_app: {
                  url: `${env.MINI_APP_PUBLIC_URL.replace(/\/$/, '')}/orders`,
                },
              },
            ],
          ],
        },
      });
      await prisma.orderRequest.update({
        where: { id: order.id },
        data: { notificationState: 'SENT', notificationSentAt: new Date() },
      });
    } catch {
      await prisma.orderRequest.update({
        where: { id: order.id },
        data: {
          notificationState:
            order.notificationAttempts >= 4 ? 'FAILED' : 'PENDING',
          notificationNextAt: new Date(
            Date.now() + 60000 * Math.pow(2, order.notificationAttempts),
          ),
        },
      });
    }
  }
}

export function startOrderNotifier(app: FastifyInstance) {
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = deliverOrderNotifications()
      .catch(() => app.log.warn('Order notification worker failed; will retry'))
      .finally(() => {
        running = undefined;
      });
  };
  let timer: ReturnType<typeof setInterval>;
  app.addHook('onReady', async () => {
    timer = setInterval(tick, 5000);
    timer.unref();
    tick();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await running;
  });
}
