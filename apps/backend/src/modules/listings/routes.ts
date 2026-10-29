import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { serializable } from '../../lib/transaction.js';
import {
  InputError,
  formatMoney,
  moneyMinor,
  objectBody,
  requestKey,
  textField,
} from '../../lib/input.js';

let processingPhotos = 0;
export async function normalizePhoto(value: unknown) {
  if (typeof value !== 'string' || value.length > 5700000)
    throw new InputError(
      400,
      'Выберите фото JPEG, PNG или WebP размером до 4 МБ.',
    );
  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) throw new InputError(400, 'Выберите фото JPEG, PNG или WebP.');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > 4 * 1024 * 1024)
    throw new InputError(400, 'Фото должно быть не больше 4 МБ.');
  if (processingPhotos >= 2)
    throw new InputError(
      429,
      'Загрузка фото занята. Попробуйте через несколько секунд.',
    );
  processingPhotos++;
  try {
    const image = sharp(bytes, { limitInputPixels: 25000000 });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) > 1
    )
      throw new Error('Unsupported');
    const output = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    if (output.length > 1024 * 1024) throw new Error('Photo too large');
    return output;
  } catch {
    throw new InputError(
      400,
      'Не удалось прочитать фото. Выберите другой JPEG, PNG или WebP.',
    );
  } finally {
    processingPhotos--;
  }
}

export async function mediaRoutes(app: FastifyInstance) {
  app.get('/media/:id', async (request, reply) => {
    const image = await prisma.media.findUnique({
      where: { id: (request.params as { id: string }).id },
      select: { data: true },
    });
    if (!image) throw new InputError(404, 'Фото не найдено.');
    return reply
      .header('Content-Type', 'image/jpeg')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(image.data));
  });
}

export async function listingsRoutes(app: FastifyInstance) {
  app.post(
    '/photo',
    {
      bodyLimit: 5700100,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      if (
        (await prisma.media.count({
          where: { ownerUserId: request.seller.id },
        })) >= 200
      )
        throw new InputError(
          409,
          'Достигнут лимит 200 фотографий. Свяжитесь с поддержкой.',
        );
      const data = await normalizePhoto(objectBody(request.body).dataUrl);
      const image = await serializable(async (tx) => {
        if (
          (await tx.media.count({
            where: { ownerUserId: request.seller.id },
          })) >= 200
        )
          throw new InputError(409, 'Достигнут лимит 200 фотографий.');
        return tx.media.create({
          data: { ownerUserId: request.seller.id, data },
          select: { id: true },
        });
      });
      return { id: image.id, url: `/media/${image.id}` };
    },
  );
  app.get('/', async (request) => {
    const query = request.query as { before?: string };
    const rows = await prisma.offer.findMany({
      where: { ownerUserId: request.seller.id },
      include: { product: { include: { images: { take: 1 } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 31,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });
    return {
      offers: rows.slice(0, 30),
      next: rows.length > 30 ? rows[29]!.id : null,
    };
  });
  app.post('/', async (request, reply) => {
    const p = objectBody(request.body);
    const key = requestKey(p.requestKey);
    const title = textField(p.title, 'Название', 100);
    const description = textField(p.description, 'Описание', 700, true) || null;
    const priceMinor = moneyMinor(p.price);
    const photoId = textField(p.photoId, 'Фото', 100, true) || null;
    const quantityLimit =
      p.quantityLimit === null || p.quantityLimit === undefined
        ? null
        : p.quantityLimit;
    if (
      quantityLimit !== null &&
      (typeof quantityLimit !== 'number' ||
        !Number.isInteger(quantityLimit) ||
        quantityLimit < 1 ||
        quantityLimit > 100000)
    )
      throw new InputError(
        400,
        'Количество должно быть целым числом от 1 до 100 000.',
      );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          title,
          description,
          priceMinor,
          photoId,
          quantityLimit,
        }),
      )
      .digest('hex');
    const offer = await serializable(async (tx) => {
      const previous = await tx.offer.findUnique({
        where: { creationKey: key },
      });
      if (previous) {
        if (
          previous.ownerUserId !== request.seller.id ||
          previous.creationFingerprint !== fingerprint
        )
          throw new InputError(
            409,
            'Форма уже сохранена с другими данными. Создайте новый товар.',
          );
        return previous;
      }
      if (
        photoId &&
        !(await tx.media.findUnique({
          where: { id: photoId, ownerUserId: request.seller.id },
        }))
      )
        throw new InputError(400, 'Загрузите фото заново.');
      if (
        (await tx.product.count({
          where: { ownerUserId: request.seller.id },
        })) >= 200
      )
        throw new InputError(
          409,
          'Достигнут лимит 200 товаров. Свяжитесь с поддержкой.',
        );
      const product = await tx.product.create({
        data: {
          ownerUserId: request.seller.id,
          title,
          description,
          priceMinor,
          priceText: formatMoney(priceMinor),
          quantityLimit,
          ...(photoId
            ? { images: { create: { fileUrl: `/media/${photoId}` } } }
            : {}),
        },
      });
      return tx.offer.create({
        data: {
          ownerUserId: request.seller.id,
          productId: product.id,
          title,
          text: description,
          creationKey: key,
          creationFingerprint: fingerprint,
        },
      });
    });
    return reply.code(201).send({ id: offer.id, status: offer.status });
  });
}
