import { useEffect, useState } from 'react';
import { requestJson, errorText } from '../api/client';

export function useLiveQuery<T>(url: string, delay = 250) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    revision: number;
    data?: T;
    error?: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      void requestJson<T>(url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(25000),
        ]),
      })
        .then((data) => {
          if (active) setResult({ url, revision, data });
        })
        .catch((error) => {
          if (active) setResult({ url, revision, error: errorText(error) });
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, revision, delay]);
  const current = result?.url === url && result.revision === revision;
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : undefined,
    loading: !current,
    refresh: () => setRevision((n) => n + 1),
  };
}
