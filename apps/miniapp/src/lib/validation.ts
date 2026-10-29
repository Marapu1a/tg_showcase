export const contactError = (type: string, value: string) => {
  const contact = value.trim();
  if (!contact) return 'Укажите контакт для связи.';
  if (contact.length > 160) return 'Не больше 160 символов.';
  if (type === 'TELEGRAM' && !/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(contact))
    return 'Введите @имя: латинские буквы, цифры и _, от 4 до 32 знаков после @.';
  if (
    type === 'PHONE' &&
    (!/^\+?[0-9 ()-]{7,25}$/.test(contact) ||
      !/^\d{7,15}$/.test(contact.replace(/\D/g, '')))
  )
    return 'Введите номер: от 7 до 15 цифр. Допустимы +, пробелы, скобки и дефисы.';
  return '';
};
export function quantityError(value: string, max: number) {
  return /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= max
    ? ''
    : `Введите целое количество от 1 до ${max}.`;
}
export function priceError(value: string) {
  return /^\d{1,6}([.,]\d{1,2})?$/.test(value.trim()) &&
    Number(value.replace(',', '.')) > 0
    ? ''
    : 'Цена от 0,01 до 999 999,99 ₽, не больше двух знаков после запятой.';
}
