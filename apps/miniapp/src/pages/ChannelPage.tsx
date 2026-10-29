import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConnectedChannel,
  connectChannel,
  getChannel,
  getChannelBot,
  requestChannelButton,
  verifyChannel,
} from '../api/client';

export function ChannelPage() {
  const [channel, setChannel] = useState<ConnectedChannel | null>(null);
  const [bot, setBot] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [verified, setVerified] = useState(false);
  const webApp = window.Telegram?.WebApp;
  const loggedIn = Boolean(webApp?.initData);
  const nativePicker = Boolean(
    webApp?.requestChat && webApp?.isVersionAtLeast?.('9.6'),
  );
  const message = (err: unknown) =>
    err instanceof Error ? err.message : 'Не удалось подключить канал.';

  const reload = useCallback(async () => {
    const result = await getChannel();
    setChannel(result.channel);
    return result.channel;
  }, []);

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    if (!loggedIn) return;
    let active = true;
    Promise.allSettled([getChannel(), getChannelBot()])
      .then(([result, identity]) => {
        if (!active) return;
        if (result.status === 'fulfilled') setChannel(result.value.channel);
        else setError(message(result.reason));
        if (identity.status === 'fulfilled') setBot(identity.value.username);
        else if (result.status === 'fulfilled' && !result.value.channel)
          setError(message(identity.reason));
      })
      .catch((err: unknown) => {
        if (active) setError(message(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!waiting) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getChannel();
        if (!active) return;
        if (result.channel) {
          setChannel(result.channel);
          setVerified(true);
          setWaiting(false);
          return;
        }
      } catch (err) {
        if (active) {
          setError(message(err));
          setWaiting(false);
        }
        return;
      }
      if (!active) return;
      if (++attempts >= 20) {
        setWaiting(false);
        setError(
          'Подтверждение ещё не пришло. Проверьте сообщение бота и обновите статус.',
        );
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, 2000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [waiting]);

  async function choose() {
    setBusy(true);
    setError('');
    try {
      const { id } = await requestChannelButton();
      webApp?.requestChat?.(id, (sent) => {
        if (sent) setWaiting(true);
      });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setChannel((await connectChannel(reference)).channel);
      setVerified(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError('');
    setVerified(false);
    try {
      const saved = await reload();
      if (saved) {
        setChannel((await verifyChannel()).channel);
        setVerified(true);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  if (!loggedIn)
    return (
      <section className="panel onboarding">
        <p className="eyebrow">Ваш первый шаг</p>
        <h2>Продавайте прямо из канала</h2>
        <p>
          Подключите канал, добавьте товар и опубликуйте предложение для своих
          подписчиков.
        </p>
        <div className="alert">
          Откройте приложение кнопкой «Начать продавать» в личном чате с ботом.
          Telegram выполнит вход — отдельный пароль не нужен.
        </div>
      </section>
    );

  return (
    <section className="panel onboarding">
      <p className="eyebrow">{channel ? 'Ваш канал' : 'Шаг 1 · Подключение'}</p>
      <h2>{channel ? channel.title : 'Начнём с вашего канала'}</h2>
      {loading && <p role="status">Загружаем подключение…</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!loading && channel ? (
        <>
          <p className="connection-status">Канал подключён</p>
          {channel.username && <p>@{channel.username}</p>}
          <p>
            {verified
              ? 'Права проверены. Можно переходить к товару.'
              : 'Подключение сохранено. Перед публикацией мы снова проверим права.'}
          </p>
          <div className="button-row">
            <Link className="button-link" to="/offers/new">
              Добавить товар
            </Link>
            <button
              disabled={busy}
              onClick={() => {
                void check();
              }}
            >
              {busy ? 'Проверяем…' : 'Проверить права'}
            </button>
          </div>
        </>
      ) : (
        !loading && (
          <>
            <p>
              Выберите канал, в котором вы владелец или администратор с правом
              публикации.
            </p>
            {nativePicker && (
              <div className="button-row">
                <button
                  disabled={busy || waiting}
                  onClick={() => {
                    void choose();
                  }}
                >
                  {busy ? 'Подготавливаем…' : 'Подключить канал через Telegram'}
                </button>
              </div>
            )}
            {waiting && (
              <p role="status">
                Проверяем выбранный канал. Подтверждение появится здесь и в
                боте…
              </p>
            )}
            <details open={!nativePicker}>
              <summary>Подключить по ссылке</summary>
              <ol className="connection-steps">
                <li>
                  Откройте настройки канала → «Администраторы» → «Добавить
                  администратора».
                </li>
                <li>
                  Добавьте {bot ? <strong>@{bot}</strong> : 'нашего бота'} и
                  разрешите публикацию сообщений.
                </li>
                <li>Вставьте публичную ссылку или @имя канала ниже.</li>
              </ol>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  void submit(event);
                }}
              >
                <div className="field">
                  <label htmlFor="channel-reference">Ссылка на канал</label>
                  <input
                    id="channel-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="https://t.me/my_channel"
                    maxLength={200}
                    required
                    disabled={busy || waiting}
                  />
                </div>
                <div className="button-row">
                  <button disabled={busy || waiting}>
                    {busy ? 'Проверяем права…' : 'Проверить и подключить'}
                  </button>
                </div>
              </form>
              {!nativePicker && (
                <p className="muted">
                  Для закрытого канала обновите Telegram: подключение доступно
                  через встроенный выбор канала.
                </p>
              )}
            </details>
            <p className="muted">
              Пока можно подключить один канал. Этот шаг ничего не публикует.
            </p>
          </>
        )
      )}
      {!channel && (
        <div className="button-row">
          <button
            disabled={busy || loading}
            onClick={() => {
              void check();
            }}
          >
            Обновить статус
          </button>
        </div>
      )}
    </section>
  );
}
