import { useEffect, useState } from 'react';
import { errorText, requestJson } from '../api/client';

export function BuyerContactSettings() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    requestJson<{ buyerContactUsername: string | null }>(
      '/channels/buyer-contact',
    )
      .then((data) => {
        if (active)
          setValue(
            data.buyerContactUsername ? `@${data.buyerContactUsername}` : '',
          );
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const valid =
    !value.trim() || /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(value.trim());
  return (
    <section className="panel">
      <h2>Связь с покупателями</h2>
      <p>
        Этот контакт будет виден покупателям после отправки заказа. Укажите свой
        аккаунт или аккаунт менеджера, принимающий сообщения от незнакомых
        людей.
      </p>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || loading || !valid) return;
          setBusy(true);
          setError('');
          setSaved(false);
          try {
            await requestJson('/channels/buyer-contact', {
              method: 'PUT',
              body: JSON.stringify({ buyerContactUsername: value }),
            });
            setSaved(true);
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="buyer-contact">Публичный Telegram @контакт</label>
          <input
            id="buyer-contact"
            value={value}
            maxLength={33}
            disabled={loading || busy}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="@shop_manager"
            aria-invalid={!valid}
            aria-describedby="buyer-contact-hint"
          />
          <span
            id="buyer-contact-hint"
            className={valid ? 'muted' : 'field-error'}
          >
            {valid
              ? 'Необязательно. Пустое поле убирает контакт из новых подтверждений заказа.'
              : 'Используйте латинские буквы, цифры и подчёркивание.'}
          </span>
        </div>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        {saved && <p role="status">Контакт сохранён.</p>}
        <div>
          <button disabled={loading || busy || !valid}>
            {busy ? 'Сохраняем…' : 'Сохранить контакт'}
          </button>
        </div>
      </form>
    </section>
  );
}
