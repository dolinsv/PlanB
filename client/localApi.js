const STORE_KEY = 'planb_store_v1';

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

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const s = emptyStore();
      save(s);
      return s;
    }
    const parsed = JSON.parse(raw);
    return {
      posts: (parsed.posts || []).map(normalizePost),
      templates: parsed.templates || [],
      history: parsed.history || [],
      seq: parsed.seq || { posts: 1, templates: 1, history: 1 },
    };
  } catch {
    const s = emptyStore();
    save(s);
    return s;
  }
}

function save(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function withReminded(row) {
  return { ...row, reminded: row.placed };
}

export async function localApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(path, 'http://local.invalid');
  const pathname = url.pathname;
  const body = options.body ? JSON.parse(options.body) : null;

  // GET /api/posts?from&to
  if (method === 'GET' && pathname === '/api/posts') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) fail('from and to required');
    const s = load();
    return s.posts
      .filter((p) => p.publish_at >= from && p.publish_at < to)
      .sort((a, b) => a.publish_at.localeCompare(b.publish_at))
      .map(withReminded);
  }

  // POST /api/posts
  if (method === 'POST' && pathname === '/api/posts') {
    if (typeof body?.text !== 'string' || !body.publish_at) {
      fail('text and publish_at required');
    }
    const s = load();
    const now = new Date().toISOString();
    const kind = body.kind || 'post';
    const network = body.network || 'vk';
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : 'Другое';
    const flag = body.placed !== undefined ? body.placed : body.reminded;

    if (body.id != null) {
      const idx = s.posts.findIndex((p) => p.id === Number(body.id));
      if (idx === -1) fail('post not found', 404);
      const prev = s.posts[idx];
      const nextPlaced =
        flag === undefined || flag === null
          ? prev.placed
          : flag === 1 || flag === true || flag === '1'
            ? 1
            : 0;
      s.posts[idx] = {
        ...prev,
        text: body.text,
        publish_at: body.publish_at,
        kind,
        network,
        category: category || prev.category || 'Другое',
        placed: nextPlaced,
      };
      const row = s.posts[idx];
      if (prev.placed !== 1 && nextPlaced === 1) {
        if (!s.history.some((h) => h.post_id === row.id)) {
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
      save(s);
      return withReminded(row);
    }

    const row = {
      id: s.seq.posts++,
      text: body.text,
      publish_at: body.publish_at,
      kind,
      network,
      category,
      placed: 0,
    };
    s.posts.push(row);
    save(s);
    return withReminded(row);
  }

  // DELETE /api/posts/:id
  const postDel = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (method === 'DELETE' && postDel) {
    const s = load();
    const id = Number(postDel[1]);
    const before = s.posts.length;
    s.posts = s.posts.filter((p) => p.id !== id);
    if (s.posts.length === before) fail('post not found', 404);
    save(s);
    return { ok: true };
  }

  // GET /api/templates
  if (method === 'GET' && pathname === '/api/templates') {
    const s = load();
    return [...s.templates].sort(
      (a, b) => a.category.localeCompare(b.category, 'ru') || a.id - b.id
    );
  }

  // POST /api/templates
  if (method === 'POST' && pathname === '/api/templates') {
    if (typeof body?.category !== 'string' || !body.category.trim()) {
      fail('category required');
    }
    if (typeof body?.text !== 'string' || !body.text.trim()) {
      fail('text required');
    }
    const s = load();
    if (body.id != null) {
      const idx = s.templates.findIndex((t) => t.id === Number(body.id));
      if (idx === -1) fail('template not found', 404);
      s.templates[idx] = {
        ...s.templates[idx],
        category: body.category.trim(),
        text: body.text.trim(),
      };
      save(s);
      return s.templates[idx];
    }
    const row = {
      id: s.seq.templates++,
      category: body.category.trim(),
      text: body.text.trim(),
    };
    s.templates.push(row);
    save(s);
    return row;
  }

  // DELETE /api/templates/:id
  const tplDel = pathname.match(/^\/api\/templates\/(\d+)$/);
  if (method === 'DELETE' && tplDel) {
    const s = load();
    const id = Number(tplDel[1]);
    const before = s.templates.length;
    s.templates = s.templates.filter((t) => t.id !== id);
    if (s.templates.length === before) fail('template not found', 404);
    save(s);
    return { ok: true };
  }

  // GET /api/history
  if (method === 'GET' && pathname === '/api/history') {
    const s = load();
    return [...s.history].sort((a, b) =>
      (b.placed_at || '').localeCompare(a.placed_at || '')
    );
  }

  fail('not found', 404);
}
