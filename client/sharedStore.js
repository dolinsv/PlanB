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

/** Firebase may return arrays as objects with numeric keys. */
function asArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x) => x != null);
  if (typeof val === 'object') {
    return Object.keys(val)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => val[k])
      .filter((x) => x != null);
  }
  return [];
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
    posts: asArray(raw.posts).map(normalizePost),
    templates: asArray(raw.templates),
    history: asArray(raw.history),
    seq: {
      posts: Number(raw.seq?.posts) || 1,
      templates: Number(raw.seq?.templates) || 1,
      history: Number(raw.seq?.history) || 1,
    },
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

function seedTextSet() {
  return new Set(SEED_TEMPLATES.map((t) => String(t.text).trim()));
}

/** Default demo templates only — not user-created content. */
function isSeedOnlyTemplates(templates) {
  const list = templates || [];
  if (list.length === 0) return true;
  if (list.length > SEED_TEMPLATES.length) return false;
  const seeds = seedTextSet();
  return list.every((t) => seeds.has(String(t.text || '').trim()));
}

function hasCustomTemplates(s) {
  return Boolean(s && !isSeedOnlyTemplates(s.templates));
}

function hasUserData(s) {
  return Boolean(
    s && (s.posts?.length || s.history?.length || hasCustomTemplates(s))
  );
}

function mergeById(primary, secondary) {
  const map = new Map();
  for (const item of secondary || []) {
    if (item == null || item.id == null) continue;
    map.set(Number(item.id), item);
  }
  for (const item of primary || []) {
    if (item == null || item.id == null) continue;
    map.set(Number(item.id), item);
  }
  return [...map.values()];
}

function maxSeq(list, fallback = 1) {
  let n = fallback;
  for (const item of list || []) {
    const id = Number(item?.id);
    if (Number.isFinite(id) && id + 1 > n) n = id + 1;
  }
  return n;
}

/**
 * Merge cloud + device. Never let an empty/seed cloud wipe real local data
 * (posts, history, or custom templates).
 */
function mergeStores(remote, local) {
  if (!local) return remote;
  if (!remote) return local;

  const remoteNewer =
    (remote.updated_at || '') >= (local.updated_at || '');
  const newer = remoteNewer ? remote : local;
  const older = remoteNewer ? local : remote;

  let templates;
  if (hasCustomTemplates(older) && isSeedOnlyTemplates(newer.templates)) {
    templates = older.templates;
  } else if (hasCustomTemplates(newer) && isSeedOnlyTemplates(older.templates)) {
    templates = newer.templates;
  } else if (hasCustomTemplates(older) && hasCustomTemplates(newer)) {
    templates = mergeById(newer.templates, older.templates);
  } else {
    templates = (newer.templates?.length ? newer.templates : older.templates) || [];
  }

  let posts;
  if (!(newer.posts?.length) && older.posts?.length) {
    posts = older.posts;
  } else if (newer.posts?.length && older.posts?.length) {
    posts = mergeById(newer.posts, older.posts);
  } else {
    posts = (newer.posts?.length ? newer.posts : older.posts) || [];
  }

  let history;
  if (!(newer.history?.length) && older.history?.length) {
    history = older.history;
  } else if (newer.history?.length && older.history?.length) {
    history = mergeById(newer.history, older.history);
  } else {
    history = (newer.history?.length ? newer.history : older.history) || [];
  }

  const merged = {
    posts,
    templates,
    history,
    seq: {
      posts: Math.max(
        Number(newer.seq?.posts) || 1,
        Number(older.seq?.posts) || 1,
        maxSeq(posts)
      ),
      templates: Math.max(
        Number(newer.seq?.templates) || 1,
        Number(older.seq?.templates) || 1,
        maxSeq(templates)
      ),
      history: Math.max(
        Number(newer.seq?.history) || 1,
        Number(older.seq?.history) || 1,
        maxSeq(history)
      ),
    },
    updated_at: newer.updated_at,
  };

  const rescued =
    (hasCustomTemplates({ templates }) &&
      isSeedOnlyTemplates(newer.templates)) ||
    (posts.length || 0) > (newer.posts?.length || 0) ||
    (history.length || 0) > (newer.history?.length || 0);

  if (rescued) {
    merged.updated_at = new Date().toISOString();
  }

  return normalizeStore(merged);
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

function toRemotePayload(store) {
  return {
    posts: store.posts || [],
    templates: store.templates || [],
    history: store.history || [],
    seq: store.seq,
    updated_at: store.updated_at,
    _v: 1,
  };
}

let cache = null;
let dbRef = null;
let remoteReady = false;
let bootPromise = null;
let lastWrittenAt = '';
let writeChain = Promise.resolve();
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

function queueRemoteWrite(store) {
  if (!isRemoteSyncEnabled() || !dbRef) return Promise.resolve();
  const payload = toRemotePayload(store);
  lastWrittenAt = payload.updated_at;
  writeChain = writeChain
    .then(() => set(dbRef, payload))
    .catch((e) => console.warn('Firebase write failed', e));
  return writeChain;
}

function applyRemote(val, { allowPushLocal = false } = {}) {
  const local = cache || readLocal();

  if (!val) {
    remoteReady = true;
    if (!cache) {
      cache = local || emptyStore();
      writeLocal(cache);
    }
    if (allowPushLocal && cache && hasUserData(cache)) {
      queueRemoteWrite(cache);
    }
    return;
  }

  let next;
  try {
    next = normalizeStore(val);
  } catch (e) {
    console.warn('Bad remote store, keeping local', e);
    remoteReady = true;
    return;
  }

  const merged = mergeStores(next, local);
  const shouldPush =
    allowPushLocal &&
    local &&
    merged.updated_at !== next.updated_at;

  cache = merged;
  writeLocal(cache);
  remoteReady = true;

  if (shouldPush) {
    queueRemoteWrite(cache);
  }
}

function initRemote() {
  if (!isRemoteSyncEnabled() || dbRef) return;
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  dbRef = ref(db, REMOTE_PATH);

  onValue(dbRef, (snap) => {
    const val = snap.val();
    if (val?.updated_at && val.updated_at === lastWrittenAt) {
      remoteReady = true;
      return;
    }
    const prevAt = cache?.updated_at || '';
    applyRemote(val, { allowPushLocal: true });
    if (cache && cache.updated_at !== prevAt) emit();
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
  if (cache && remoteReady) return cache;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    initRemote();
    const local = readLocal();

    if (isRemoteSyncEnabled() && dbRef) {
      try {
        const snap = await get(dbRef);
        if (snap.exists()) {
          applyRemote(snap.val(), { allowPushLocal: true });
          return cache;
        }
        cache = local || emptyStore();
        writeLocal(cache);
        remoteReady = true;
        await queueRemoteWrite(cache);
        return cache;
      } catch (e) {
        console.warn('Firebase read failed, using localStorage', e);
      }
    }

    cache = local || emptyStore();
    writeLocal(cache);
    remoteReady = true;
    return cache;
  })();

  try {
    return await bootPromise;
  } finally {
    bootPromise = null;
  }
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
    try {
      await queueRemoteWrite(cache);
    } catch (e) {
      console.warn('Firebase write failed', e);
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
