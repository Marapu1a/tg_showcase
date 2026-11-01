import { Link, Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from '../lib/useLiveQuery';

import { type HubProject, projectStatuses } from '../lib/hub';
export function HubEntry() {
  return window.Telegram?.WebApp?.initData ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <HubPage />
  );
}
export function HubPage() {
  const { data, error, loading, refresh } = useLiveQuery<{
    projects: HubProject[];
  }>('/projects', 0, false);
  return (
    <>
      <section className="hub-hero">
        <p className="eyebrow">Небольшие сервисы для Telegram</p>
        <h2>
          Меньше настроек.
          <br />
          Больше пользы.
        </h2>
        <p>
          Проекты TG Zoo решают конкретные задачи прямо в Telegram. Выберите то,
          что нужно вам.
        </p>
      </section>
      {loading && <p role="status">Загружаем проекты…</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}{' '}
          <button className="secondary" onClick={refresh}>
            Повторить
          </button>
        </div>
      )}
      {!loading && data?.projects.length === 0 && (
        <p className="panel">Скоро здесь появятся проекты.</p>
      )}
      <div className="hub-projects">
        {data?.projects.map((project) => (
          <article className="panel hub-project" key={project.slug}>
            <div className="project-heading">
              <span className="project-monogram" aria-hidden="true">
                {project.name.slice(0, 2).toUpperCase()}
              </span>
              <span
                className={`status-pill status-${project.status === 'ACTIVE' ? 'active' : project.status === 'PAUSED' ? 'paused' : 'draft'}`}
              >
                {projectStatuses[project.status]}
              </span>
            </div>
            <h2>{project.name}</h2>
            <p>{project.summary}</p>
            <div className="button-row">
              {project.status === 'ACTIVE' && (
                <a className="button-link" href={project.telegramUrl}>
                  Открыть в Telegram
                </a>
              )}
              <Link
                className="button-link secondary"
                to={`/projects/${project.slug}`}
              >
                О проекте
              </Link>
            </div>
          </article>
        ))}
      </div>
      <p className="muted">
        Есть идея или предложение?{' '}
        <a href="https://t.me/valentin_marapulets">Напишите нам</a>.
      </p>
    </>
  );
}
export function HubProjectPage() {
  const { slug } = useParams();
  const { data, error, loading, refresh } = useLiveQuery<HubProject>(
    `/projects/${encodeURIComponent(slug ?? '')}`,
    0,
    false,
  );
  return (
    <section className="panel onboarding">
      <Link to="/hub">← Все проекты</Link>
      {loading && <p role="status">Загружаем проект…</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}{' '}
          <button className="secondary" onClick={refresh}>
            Повторить
          </button>
        </div>
      )}
      {data && (
        <>
          <p className="eyebrow">{projectStatuses[data.status]}</p>
          <h2>{data.name}</h2>
          <p>{data.summary}</p>
          <p className="preserve-lines">{data.description}</p>
          {data.status === 'ACTIVE' && (
            <a className="button-link" href={data.telegramUrl}>
              Открыть в Telegram
            </a>
          )}
        </>
      )}
    </section>
  );
}
