const STORAGE_KEY = 'planb_notified_v1';
const LEAD_MS = 60 * 60 * 1000; // 1 hour before publish
const TICK_MS = 30_000;

function readNotified() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeNotified(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function notifyKey(post) {
  return `${post.id}:${post.publish_at}`;
}

export function notificationSupport() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission; // default | granted | denied
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function showNotification(post) {
  const kind = post.kind === 'clip' ? 'Клип' : post.kind === 'story' ? 'Сторис' : 'Пост';
  const when = new Date(post.publish_at);
  const time = when.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const body = (post.text || '').trim().slice(0, 120) || 'Без текста';
  try {
    const n = new Notification(`Через час: ${kind} · ${time}`, {
      body,
      tag: `planb-${post.id}`,
      renotify: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

/**
 * Poll posts and fire a local notification ~1 hour before publish_at.
 * Returns a stop function.
 */
export function startReminderLoop(getPosts) {
  if (typeof window === 'undefined') return () => {};

  const tick = () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    const posts = getPosts?.() || [];
    const now = Date.now();
    const notified = readNotified();
    let dirty = false;

    for (const p of posts) {
      if (!p?.id || !p.publish_at) continue;
      if (p.reminded === 1 || p.placed === 1) continue;
      const at = new Date(p.publish_at).getTime();
      if (!Number.isFinite(at)) continue;
      const lead = at - now;
      // Fire once when we enter the last hour before publish
      if (lead > LEAD_MS || lead <= 0) continue;
      const key = notifyKey(p);
      if (notified[key]) continue;
      showNotification(p);
      notified[key] = now;
      dirty = true;
    }

    // prune old keys (> 7 days)
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(notified)) {
      if (notified[k] < weekAgo) {
        delete notified[k];
        dirty = true;
      }
    }
    if (dirty) writeNotified(notified);
  };

  tick();
  const id = setInterval(tick, TICK_MS);
  const onVis = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}
