import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'fs';
import { join } from 'path';

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

function emptyStore() {
  return {
    posts: [],
    templates: SEED_TEMPLATES.map((t, i) => ({ id: i + 1, ...t })),
    history: [],
    seq: { posts: 1, templates: SEED_TEMPLATES.length + 1, history: 1 },
  };
}

function normalizePost(p) {
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

export function createStore(rootDir) {
  const dataDir = join(rootDir, 'data');
  const storePath = join(dataDir, 'store.json');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  let cache = null;

  function persist(store) {
    const tmp = `${storePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(tmp, storePath);
    cache = store;
  }

  function load() {
    if (cache) return cache;
    if (!existsSync(storePath)) {
      cache = emptyStore();
      persist(cache);
      return cache;
    }
    const raw = JSON.parse(readFileSync(storePath, 'utf8'));
    cache = {
      posts: (raw.posts || []).map(normalizePost),
      templates: raw.templates || [],
      history: raw.history || [],
      seq: raw.seq || { posts: 1, templates: 1, history: 1 },
    };
    return cache;
  }

  function update(mutator) {
    const store = structuredClone(load());
    const result = mutator(store);
    persist(store);
    return result;
  }

  return {
    path: storePath,
    load,
    update,
    getPosts(from, to) {
      return load()
        .posts.filter((p) => p.publish_at >= from && p.publish_at < to)
        .sort((a, b) => a.publish_at.localeCompare(b.publish_at));
    },
    getPost(id) {
      return load().posts.find((p) => p.id === Number(id)) || null;
    },
    upsertPost({ id, text, publish_at, kind, network, category, placed }) {
      return update((s) => {
        const now = new Date().toISOString();
        if (id != null) {
          const idx = s.posts.findIndex((p) => p.id === Number(id));
          if (idx === -1) return null;
          const prev = s.posts[idx];
          const nextPlaced =
            placed === undefined || placed === null
              ? prev.placed
              : placed === 1 || placed === true
                ? 1
                : 0;
          s.posts[idx] = {
            ...prev,
            text,
            publish_at,
            kind,
            network,
            category: category || prev.category || 'Другое',
            placed: nextPlaced,
          };
          const row = s.posts[idx];
          if (prev.placed !== 1 && nextPlaced === 1) {
            const already = s.history.some((h) => h.post_id === row.id);
            if (!already) {
              s.history.push({
                id: s.seq.history++,
                post_id: row.id,
                text: row.text,
                publish_at: row.publish_at,
                placed_at: now,
                kind: row.kind,
                network: row.network,
                category: row.category || 'Другое',
              });
            }
          } else if (prev.placed === 1 && nextPlaced === 0) {
            s.history = s.history.filter((h) => h.post_id !== row.id);
          } else if (nextPlaced === 1) {
            // обновить снимок в истории
            for (const h of s.history) {
              if (h.post_id === row.id) {
                h.text = row.text;
                h.publish_at = row.publish_at;
                h.kind = row.kind;
                h.network = row.network;
                h.category = row.category || 'Другое';
              }
            }
          }
          return row;
        }
        const row = {
          id: s.seq.posts++,
          text,
          publish_at,
          kind,
          network,
          category: category || 'Другое',
          placed: 0,
        };
        s.posts.push(row);
        return row;
      });
    },
    deletePost(id) {
      return update((s) => {
        const before = s.posts.length;
        s.posts = s.posts.filter((p) => p.id !== Number(id));
        return s.posts.length < before;
      });
    },
    getTemplates() {
      return [...load().templates].sort((a, b) =>
        a.category.localeCompare(b.category, 'ru') || a.id - b.id
      );
    },
    upsertTemplate({ id, category, text }) {
      return update((s) => {
        if (id != null) {
          const idx = s.templates.findIndex((t) => t.id === Number(id));
          if (idx === -1) return null;
          s.templates[idx] = { ...s.templates[idx], category, text };
          return s.templates[idx];
        }
        const row = { id: s.seq.templates++, category, text };
        s.templates.push(row);
        return row;
      });
    },
    deleteTemplate(id) {
      return update((s) => {
        const before = s.templates.length;
        s.templates = s.templates.filter((t) => t.id !== Number(id));
        return s.templates.length < before;
      });
    },
    getHistory() {
      return [...load().history].sort((a, b) =>
        (b.placed_at || '').localeCompare(a.placed_at || '')
      );
    },
  };
}
