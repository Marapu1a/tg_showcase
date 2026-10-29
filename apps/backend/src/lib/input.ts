export class InputError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError(400, 'Некорректные данные формы.');
  return value as Record<string, unknown>;
}
export function textField(
  value: unknown,
  label: string,
  max: number,
  optional = false,
) {
  if (optional && (value === undefined || value === null || value === ''))
    return '';
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    [...value].some((char) => {
      const n = char.charCodeAt(0);
      return n === 127 || (n < 32 && n !== 9 && n !== 10 && n !== 13);
    })
  )
    throw new InputError(
      400,
      `Проверьте поле «${label}» (до ${max} символов).`,
    );
  return value.trim();
}
export function requestKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new InputError(400, 'Обновите форму и попробуйте снова.');
  return value.toLowerCase();
}
export function moneyMinor(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new InputError(400, 'Укажите числовую цену.');
  const price = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(price))
    throw new InputError(
      400,
      'Укажите цену в рублях, не более двух знаков после запятой.',
    );
  const [rubles, cents = ''] = price.split('.');
  const result = Number(rubles) * 100 + Number(cents.padEnd(2, '0'));
  if (result < 1 || result > 100000000)
    throw new InputError(400, 'Цена должна быть от 0,01 до 999 999,99 ₽.');
  return result;
}
export function formatMoney(minor: number) {
  return (
    (minor / 100).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ₽'
  );
}
