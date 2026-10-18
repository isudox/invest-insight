import { useCallback, useEffect, useState } from 'react';
import i18n from './i18n';

/** 任何接口返回 401（会话失效）时广播，App 据此回到登录页。 */
export const UNAUTHORIZED_EVENT = 'ii:unauthorized';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  // 写请求一律以 JSON 发送：服务端据此做 CSRF 防护
  const unsafe = method !== 'GET';
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    // X-Locale：服务端据此返回对应语言的错误信息与体检文案
    headers: unsafe ? { 'Content-Type': 'application/json', 'X-Locale': i18n.language } : { 'X-Locale': i18n.language },
    body: unsafe ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/login')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? i18n.t('common.requestFailed', { status: res.status }));
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** 任何写操作后广播，让各页面重新拉取数据。 */
const listeners = new Set<() => void>();
export function notifyDataChanged() {
  listeners.forEach((fn) => fn());
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!url) return;
    setLoading(true);
    api
      .get<T>(url)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    reload();
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);

  return { data, error, loading, reload };
}
