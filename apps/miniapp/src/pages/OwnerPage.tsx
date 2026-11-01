import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  errorText,
  requestJson,
  statusNames,
  type OrderStatus,
} from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';
import { type HubProject, projectStatuses } from '../lib/hub';

const date = (value: string) =>
  new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
const number = (value: number) => value.toLocaleString('ru-RU');
function QueryState({ loading, error }: { loading: boolean; error?: string }) {
  return (
    <>
      {loading && <p role="status">Загружаем…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
type Summary = {
  asOf: string;
  accounts: number;
  channels: number;
  products: number;
  publications: number;
  orders: { status: OrderStatus; _count: { _all: number } }[];
  payments: {
    state: string;
    _sum: { stars: number | null };
    _count: { _all: number };
  }[];
};
function Overview() {
  const [period, setPeriod] = useState('30');
  const query = useLiveQuery<Summary>(`/admin/summary?period=${period}`, 0);
  const stars = useLiveQuery<{
    balance: {
      amount: number;
      nanostarAmount: number;
      fetchedAt: string;
    } | null;
    error: string | null;
    stale: boolean;
  }>('/admin/stars', 0);
  const data = query.data;
  return (
    <>
      <div className="owner-toolbar">
        <div className="field">
          <label htmlFor="owner-period">Период</label>
          <select
            id="owner-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">Последние 7 дней</option>
            <option value="30">Последние 30 дней</option>
            <option value="all">Всё время</option>
          </select>
        </div>
        <button
          className="secondary"
          disabled={query.loading || stars.loading}
          onClick={() => {
            query.refresh();
            stars.refresh();
          }}
        >
          Обновить
        </button>
      </div>
      <QueryState {...query} />
      {data && (
        <>
          <h3>PocketShowcase</h3>
          <div className="owner-metrics">
            {[
              ['Новые аккаунты', data.accounts],
              ['Создано товаров', data.products],
              ['Опубликовано постов', data.publications],
              [
                'Получено заявок',
                data.orders.reduce((sum, row) => sum + row._count._all, 0),
              ],
            ].map(([label, value]) => (
              <div className="owner-metric" key={label}>
                <span className="muted">{label}</span>
                <strong>{number(Number(value))}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            Подключено каналов сейчас: {data.channels}. Обновлено{' '}
            {date(data.asOf)} МСК.
          </p>
          <h3>Состояние заявок за период</h3>
          {data.orders.length ? (
            <div className="button-row">
              {data.orders.map((row) => (
                <span
                  className={`status-pill status-${row.status.toLowerCase()}`}
                  key={row.status}
                >
                  {statusNames[row.status]}: {row._count._all}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">Заявок за этот период нет.</p>
          )}
          <p className="muted">
            «Выполнен» — отметка продавца. Оплату товаров сервис не проверяет.
          </p>
          <h3>Оплаты размещений за период</h3>
          <dl className="stock-breakdown">
            <dt>Получено</dt>
            <dd>
              {number(
                data.payments.reduce(
                  (sum, row) => sum + (row._sum.stars ?? 0),
                  0,
                ),
              )}{' '}
              ⭐
            </dd>
            <dt>Возвращено по этим оплатам</dt>
            <dd>
              {number(
                data.payments.find((row) => row.state === 'REFUNDED')?._sum
                  .stars ?? 0,
              )}{' '}
              ⭐
            </dd>
            <dt>Ожидает возврата</dt>
            <dd>
              {number(
                data.payments.find((row) => row.state === 'REFUND_PENDING')
                  ?._sum.stars ?? 0,
              )}{' '}
              ⭐
            </dd>
          </dl>
          <p className="muted">
            Период определяется датой получения платежа; возвраты показаны по
            этим платежам на текущий момент.
          </p>
        </>
      )}
      <section className="owner-balance">
        <h3>Баланс бота в Telegram</h3>
        <QueryState loading={stars.loading} error={stars.error} />
        {stars.data && (
          <>
            <p className="price">
              {stars.data.balance
                ? `${number(stars.data.balance.amount + stars.data.balance.nanostarAmount / 1e9)} ⭐`
                : '—'}
            </p>
            {stars.data.error && (
              <p className="alert error" role="alert">
                {stars.data.error}
              </p>
            )}
            {stars.data.balance && (
              <p className="muted">
                {stars.data.stale
                  ? 'Последнее успешное получение'
                  : 'Получено из Telegram'}
                : {date(stars.data.balance.fetchedAt)} МСК.
              </p>
            )}
          </>
        )}
        <p className="muted">
          @showcase_lite_bot · отдельный баланс бота. Это не личные Stars и не
          сумма, доступная к выводу. Обновляется не чаще раза в минуту.
        </p>
      </section>
    </>
  );
}
function Payments() {
  const [page, setPage] = useState(1);
  const query = useLiveQuery<{
    payments: {
      chargeId: string;
      stars: number;
      state: string;
      reason: string | null;
      createdAt: string;
      offer: { title: string };
    }[];
    next: number | null;
  }>(`/admin/payments?page=${page}`, 0);
  const names: Record<string, string> = {
    PAID: 'Получен',
    REFUNDED: 'Возвращён',
    REFUND_PENDING: 'Ожидает возврата',
  };
  return (
    <>
      <h3>Платежи PocketShowcase</h3>
      <QueryState {...query} />
      {query.data?.payments.length === 0 && <p>Платежей пока нет.</p>}
      <ul className="history-list">
        {query.data?.payments.map((p) => (
          <li key={p.chargeId}>
            <strong>
              {p.offer.title} · {p.stars} ⭐
            </strong>
            <p>
              {names[p.state] ?? p.state} · {date(p.createdAt)} МСК
            </p>
            {p.reason && <p>{p.reason}</p>}
            <details>
              <summary>Идентификатор платежа</summary>
              <code className="owner-id">{p.chargeId}</code>
            </details>
          </li>
        ))}
      </ul>
      <div className="button-row pagination">
        <button
          disabled={page === 1 || query.loading}
          onClick={() => setPage((n) => n - 1)}
        >
          Назад
        </button>
        <span>Страница {page}</span>
        <button
          disabled={!query.data?.next || query.loading}
          onClick={() => query.data?.next && setPage(query.data.next)}
        >
          Далее
        </button>
      </div>
      <button
        className="secondary"
        onClick={query.refresh}
        disabled={query.loading}
      >
        Обновить
      </button>
    </>
  );
}
function Problems() {
  const query = useLiveQuery<{
    counts: { offers: number; refunds: number; notifications: number };
    offers: { id: string; title: string; publishState: string }[];
    refunds: {
      chargeId: string;
      stars: number;
      refundAttempts: number;
      refundNextAt: string;
    }[];
    notifications: {
      id: string;
      number: number;
      notificationState: string;
      notificationAttempts: number;
    }[];
  }>('/admin/problems', 0);
  return (
    <>
      <h3>Требуют внимания</h3>
      <p className="muted">
        Показываем по 30 первых записей. Новые отправки попадают сюда после пяти
        минут ожидания. Это список для проверки, без автоматического повторения
        публикаций.
      </p>
      <button
        className="secondary"
        onClick={query.refresh}
        disabled={query.loading}
      >
        Обновить
      </button>
      <QueryState {...query} />
      {query.data && (
        <>
          <h4>
            Публикации с неизвестным результатом · {query.data.counts.offers}
          </h4>
          {!query.data.counts.offers && <p className="muted">Нет.</p>}
          <ul className="history-list">
            {query.data.offers.map((row) => (
              <li key={row.id}>
                <strong>{row.title}</strong>
                <p>
                  {row.publishState === 'UNCERTAIN'
                    ? 'Результат неизвестен'
                    : 'Отправка затянулась'}
                </p>
                <code className="owner-id">{row.id}</code>
              </li>
            ))}
          </ul>
          <h4>Возвраты в очереди · {query.data.counts.refunds}</h4>
          {!query.data.counts.refunds && <p className="muted">Нет.</p>}
          <ul className="history-list">
            {query.data.refunds.map((row) => (
              <li key={row.chargeId}>
                <strong>{row.stars} ⭐</strong>
                <p>
                  Попыток: {row.refundAttempts}. Следующая:{' '}
                  {date(row.refundNextAt)} МСК.
                </p>
                <code className="owner-id">{row.chargeId}</code>
              </li>
            ))}
          </ul>
          <h4>Уведомления о заказах · {query.data.counts.notifications}</h4>
          {!query.data.counts.notifications && <p className="muted">Нет.</p>}
          <ul className="history-list">
            {query.data.notifications.map((row) => (
              <li key={row.id}>
                Заказ №{row.number} ·{' '}
                {row.notificationState === 'FAILED'
                  ? 'Не доставлено'
                  : 'Ожидает доставки'}{' '}
                · попыток {row.notificationAttempts}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
const blank: HubProject = {
  slug: '',
  name: '',
  summary: '',
  description: '',
  telegramUrl: 'https://t.me/',
  status: 'COMING_SOON',
  visible: false,
};
function Projects() {
  const query = useLiveQuery<{ projects: HubProject[] }>('/admin/projects', 0);
  const audit = useLiveQuery<{
    events: {
      id: string;
      action: string;
      projectId: string;
      createdAt: string;
    }[];
  }>('/admin/audit', 0);
  const [draft, setDraft] = useState<HubProject | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(`/admin/projects${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify(draft),
      });
      setDraft(null);
      query.refresh();
      audit.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h3>Каталог проектов</h3>
      <p className="muted">
        Здесь меняются карточки хаба. Скрытие карточки не останавливает бота или
        приложение.
      </p>
      <QueryState {...query} />
      {!draft ? (
        <>
          <div className="button-row">
            <button
              onClick={() => {
                setDraft({ ...blank });
                setError('');
              }}
            >
              Добавить проект
            </button>
            <button
              className="secondary"
              onClick={query.refresh}
              disabled={query.loading}
            >
              Обновить
            </button>
          </div>
          <div className="compact-list owner-project-list">
            {query.data?.projects.map((project) => (
              <button
                className="compact-row"
                key={project.id}
                onClick={() => {
                  setDraft({ ...project });
                  setError('');
                }}
              >
                <span className="row-main">
                  <strong>{project.name}</strong>
                  <span className="muted">
                    {project.slug} · {projectStatuses[project.status]}
                  </span>
                </span>
                <span className="status-pill">
                  {project.visible ? 'В каталоге' : 'Скрыт'}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {(['name', 'slug', 'summary', 'telegramUrl'] as const).map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`project-${key}`}>
                {
                  {
                    name: 'Название',
                    slug: 'Адрес страницы',
                    summary: 'Краткое описание',
                    telegramUrl: 'Ссылка на Telegram-проект',
                  }[key]
                }
              </label>
              <input
                id={`project-${key}`}
                required
                disabled={busy}
                maxLength={
                  { name: 80, slug: 60, summary: 200, telegramUrl: 512 }[key]
                }
                type={key === 'telegramUrl' ? 'url' : 'text'}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="project-description">Описание</label>
            <textarea
              id="project-description"
              required
              maxLength={2000}
              disabled={busy}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="project-status">Статус</label>
            <select
              id="project-status"
              disabled={busy}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {Object.entries(projectStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              disabled={busy}
              checked={Boolean(draft.visible)}
              onChange={(e) =>
                setDraft({ ...draft, visible: e.target.checked })
              }
            />
            Показывать в публичном каталоге
          </label>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          <div className="button-row">
            <button disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить проект'}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Закрыть
            </button>
          </div>
        </form>
      )}
      <details className="order-history">
        <summary>Последние изменения каталога</summary>
        <QueryState {...audit} />
        <ul className="history-list">
          {audit.data?.events.map((event) => (
            <li key={event.id}>
              {event.action === 'PROJECT_CREATED'
                ? 'Создан проект'
                : 'Изменён проект'}{' '}
              · {date(event.createdAt)} МСК
              <br />
              <code className="owner-id">{event.projectId}</code>
            </li>
          ))}
        </ul>
        {audit.data?.events.length === 0 && <p>Изменений пока нет.</p>}
      </details>
    </>
  );
}
export function OwnerPage() {
  const access = useLiveQuery<{ isOwner: boolean }>('/owner-access', 0);
  const [tab, setTab] = useState('overview');
  if (!window.Telegram?.WebApp?.initData)
    return (
      <section className="panel onboarding">
        <h2>Панель владельца</h2>
        <p>
          Войдите через Telegram. Доступ выдаётся владельцем по Telegram ID.
        </p>
        <a
          className="button-link"
          href="https://t.me/showcase_lite_bot?startapp=admin"
        >
          Войти через Telegram
        </a>
      </section>
    );
  return (
    <section className="panel management">
      <p className="eyebrow">Закрытый раздел</p>
      <h2>Управление TG Zoo</h2>
      <QueryState {...access} />
      {access.data?.isOwner === false && (
        <p className="alert error" role="alert">
          Этот раздел доступен только владельцу TG Zoo.
        </p>
      )}
      {access.error && (
        <button className="secondary" onClick={access.refresh}>
          Повторить
        </button>
      )}
      {access.data?.isOwner && (
        <>
          <nav className="owner-tabs button-row" aria-label="Разделы админки">
            {Object.entries({
              overview: 'Сводка',
              payments: 'Оплаты',
              problems: 'Проблемы',
              projects: 'Проекты',
            }).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'overview' ? (
            <Overview />
          ) : tab === 'payments' ? (
            <Payments />
          ) : tab === 'problems' ? (
            <Problems />
          ) : (
            <Projects />
          )}
        </>
      )}
      <p>
        <Link to="/hub">Открыть публичный хаб →</Link>
      </p>
    </section>
  );
}
