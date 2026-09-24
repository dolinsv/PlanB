/** Reload when a newer deploy is published (GitHub Pages / phone PWA cache). */
export function startVersionWatch() {
  if (import.meta.env.VITE_STATIC !== 'true') return;

  const current = String(import.meta.env.VITE_APP_BUILD || '');
  if (!current) return;

  const base = import.meta.env.BASE_URL || '/';
  let checking = false;
  let lastOk = 0;

  async function check() {
    const now = Date.now();
    if (checking || now - lastOk < 4000) return;
    checking = true;
    try {
      const res = await fetch(`${base}version.json?t=${now}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const remote = String(data?.build || '');
      if (remote && remote !== current) {
        const url = new URL(window.location.href);
        url.searchParams.set('_v', remote);
        window.location.replace(url.toString());
      }
      lastOk = Date.now();
    } catch {
      /* offline / pages still propagating */
    } finally {
      checking = false;
    }
  }

  check();
  setInterval(check, 20_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) check();
  });
}
