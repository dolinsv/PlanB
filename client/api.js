import { localApi } from './localApi.js';

const STATIC = import.meta.env.VITE_STATIC === 'true';

export async function api(path, options) {
  if (STATIC) {
    return localApi(path, options);
  }
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || res.statusText);
    e.status = res.status;
    throw e;
  }
  return res.json();
}
