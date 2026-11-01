import { InputError } from './input.js';

export function queryText(value: unknown, label: string, max = 100) {
  if (value === undefined) return '';
  if (
    typeof value !== 'string' ||
    value.length > max ||
    [...value].some((c) => c.charCodeAt(0) < 32)
  )
    throw new InputError(
      400,
      `Проверьте поле «${label}» (до ${max} символов).`,
    );
  return value.trim();
}
// Prisma contains uses LIKE: user input must not act as a wildcard.
export const literalSearch = (value: string) =>
  value.replace(/[\\%_]/g, '\\$&');
export const searchableContact = (contact: string, type: string) =>
  type === 'PHONE'
    ? contact.replace(/\D/g, '')
    : contact.trim().replace(/^@/, '').toLowerCase();

export function dateRange(from: unknown, to: unknown) {
  const parse = (value: unknown) => {
    const s = queryText(value, 'Дата', 10);
    if (!s) return undefined;
    const parsed = new Date(s + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      s < '2000-01-01' ||
      s > '2100-12-31' ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== s
    )
      throw new InputError(400, 'Некорректная дата.');
    // Seller UI uses calendar days in Europe/Moscow (UTC+3).
    return new Date(s + 'T00:00:00+03:00');
  };
  const gte = parse(from),
    end = parse(to);
  if (gte && end && gte > end)
    throw new InputError(400, 'Начало периода позже окончания.');
  return gte || end
    ? { gte, lt: end ? new Date(end.getTime() + 86400000) : undefined }
    : undefined;
}
