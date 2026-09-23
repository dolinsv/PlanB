import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, get } from 'firebase/database';
import { firebaseConfig, isRemoteSyncEnabled } from './firebaseConfig.js';

const STORE_KEY = 'planb_store_v1';
const REMOTE_PATH = 'planb/store';

const SEED_TEMPLATES = [
  {
    category: 'Дети',
    text: 'Малыш сегодня впервые сказал новое слово — сохраняем этот момент 💛',
  },
  {
    category: 'Дети',
    text: 'Идеи для спокойного вечера с детьми: книги, пазлы и горячий какао',
  },
  {
    category: 'Отношения',
    text: 'Маленькие знаки внимания важнее громких обещаний. Кому напишете сегодня?',
  },
  {
    category: 'Отношения',
    text: 'Свидание дома: свечи, плейлист и телефон в другой комнате',
  },
  {
    category: 'Реклама',
    text: 'Скидка 20% только до конца недели. Подробности — в комментариях ⬇️',
  },
  {
    category: 'Реклама',
    text: 'Новинка уже в наличии. Пишите в директ — поможем с выбором',
  },
  {
    category: 'Юмор',
    text: 'Когда план на день был идеальный… а потом открыли соцсети',
  },
  {
    category: 'Мотивация',
    text: 'Один маленький шаг сегодня лучше идеального плана «когда-нибудь»',
  },
];

export function emptyStore() {
  return {
    posts: [],
    templates: SEED_TEMPLATES.map((t, i) => ({ id: i + 1, ...t })),
    history: [],
    seq: { posts: 1, templates: SEED_TEMPLATES.length + 1, history: 1 },
    updated_at: new Date().toISOString(),
  };
}

export function normalizePost(p) {
  const placed =
    p.placed === 1 || p.placed === true || p.reminded === 1 || p.reminded === true
      ? 1
      : 0;
  return {
    id: Number(p.id),
    text: String(p.text ?? ''),
    publish_at: String(p.publish_at),
    placed,
    kind: p.kind || 'post',
    network: p.network || 'vk',
    category: p.category || 'Другое',
  };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    posts: (raw.posts || []).map(normalizePost),
    templates: raw.templates || [],
    history: raw.history || [],
    seq: raw.seq || { posts: 1, templates: 1, history: 1 },
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return normalizeStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

let cache = null;
let dbRef = null;
let remoteReady = false;
let writing = false;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn(cache);
    } catch (e) {
      console.warn(fn, e);
    }
  }
}

function initRemote() {
  if (!isRemoteSyncEnabled() || dbRef) return;
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  dbRef = ref(db, REMOTE_PATH);

  onValue(dbRef, (snap) => {
    if (writing) return;
    const val = snap.val();
    if (!val) {
      remoteReady = true;
      if (!cache) {
        cache = readLocal() || emptyStore();
        writeLocal(cache);
        writing = true;
        set(dbRef, cache)
          .catch(console.warn)
          .finally(() => {
            writing = false;
          });
      }
      return;
    }
    const next = normalizeStore(val);
    const prevAt = cache?.updated_at || '';
    cache = next;
    writeLocal(cache);
    remoteReady = true;
    if (next.updated_at !== prevAt) emit();
  });
}

// other tabs / windows on the same browser
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try {
      const next = normalizeStore(JSON.parse(e.newValue));
      const prevAt = cache?.updated_at || '';
      cache = next;
      if (next.updated_at !== prevAt) emit();
    } catch {
      /* ignore */
    }
  });
}

export async function ensureStore() {
  if (cache) return cache;
  initRemote();

  if (isRemoteSyncEnabled() && dbRef) {
    try {
      const snap = await get(dbRef);
      if (snap.exists()) {
        cache = normalizeStore(snap.val());
        writeLocal(cache);
        remoteReady = true;
        return cache;
      }
    } catch (e) {
      console.warn('Firebase read failed, using localStorage', e);
    }
  }

  cache = readLocal() || emptyStore();
  writeLocal(cache);
  return cache;
}

export function getStoreSync() {
  if (!cache) {
    cache = readLocal() || emptyStore();
  }
  return cache;
}

export async function saveStore(mutator) {
  await ensureStore();
  const next = structuredClone(cache);
  const result = mutator(next);
  next.updated_at = new Date().toISOString();
  cache = normalizeStore(next);
  writeLocal(cache);

  if (isRemoteSyncEnabled() && dbRef) {
    writing = true;
    try {
      await set(dbRef, cache);
    } catch (e) {
      console.warn('Firebase write failed', e);
    } finally {
      writing = false;
    }
  }

  emit();
  return result;
}

export function subscribeStore(fn) {
  listeners.add(fn);
  initRemote();
  ensureStore().then(() => fn(cache));
  return () => listeners.delete(fn);
}

export function syncMode() {
  return isRemoteSyncEnabled() ? 'remote' : 'local';
}
