import { useEffect, useState } from 'react';

export function OrderAge({
  status,
  createdAt,
}: {
  status: string;
  createdAt: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (status !== 'NEW') return null;
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(createdAt).getTime()) / 60000),
  );
  const duration =
    minutes < 60
      ? `${minutes} мин.`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} ч.`
        : `${Math.floor(minutes / 1440)} дн.`;
  return (
    <span className={minutes >= 1440 ? 'field-error' : 'muted'}>
      Без обработки: {duration}.{' '}
    </span>
  );
}
