import {
  ensureStore,
  getStoreSync,
  saveStore,
  normalizePost,
} from './sharedStore.js';

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function withReminded(row) {
  return { ...row, reminded: row.placed };
}

export async function localApi(path, options = {}) {
  await ensureStore();
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(path, 'http://local.invalid');
  const pathname = url.pathname;
  const body = options.body ? JSON.parse(options.body) : null;

  if (method === 'GET' && pathname === '/api/posts') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) fail('from and to required');
    const s = getStoreSync();
    return s.posts
      .filter((p) => p.publish_at >= from && p.publish_at < to)
      .sort((a, b) => a.publish_at.localeCompare(b.publish_at))
      .map(withReminded);
  }

  if (method === 'POST' && pathname === '/api/posts') {
    if (typeof body?.text !== 'string' || !body.publish_at) {
      fail('text and publish_at required');
    }
    const kind = body.kind || 'post';
    const network = body.network || 'vk';
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : 'Другое';
    const flag = body.placed !== undefined ? body.placed : body.reminded;

    return saveStore((s) => {
      const now = new Date().toISOString();
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
        s.posts[idx] = normalizePost({
          ...prev,
          text: body.text,
          publish_at: body.publish_at,
          kind,
          network,
          category: category || prev.category || 'Другое',
          placed: nextPlaced,
        });
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
        return withReminded(row);
      }

      const row = normalizePost({
        id: s.seq.posts++,
        text: body.text,
        publish_at: body.publish_at,
        kind,
        network,
        category,
        placed: 0,
      });
      s.posts.push(row);
      return withReminded(row);
    });
  }

  const postDel = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (method === 'DELETE' && postDel) {
    const id = Number(postDel[1]);
    return saveStore((s) => {
      const before = s.posts.length;
      s.posts = s.posts.filter((p) => p.id !== id);
      if (s.posts.length === before) fail('post not found', 404);
      return { ok: true };
    });
  }

  if (method === 'GET' && pathname === '/api/templates') {
    const s = getStoreSync();
    return [...s.templates].sort(
      (a, b) => a.category.localeCompare(b.category, 'ru') || a.id - b.id
    );
  }

  if (method === 'POST' && pathname === '/api/templates') {
    if (typeof body?.category !== 'string' || !body.category.trim()) {
      fail('category required');
    }
    if (typeof body?.text !== 'string' || !body.text.trim()) {
      fail('text required');
    }
    return saveStore((s) => {
      if (body.id != null) {
        const idx = s.templates.findIndex((t) => t.id === Number(body.id));
        if (idx === -1) fail('template not found', 404);
        s.templates[idx] = {
          ...s.templates[idx],
          category: body.category.trim(),
          text: body.text.trim(),
        };
        return s.templates[idx];
      }
      const row = {
        id: s.seq.templates++,
        category: body.category.trim(),
        text: body.text.trim(),
      };
      s.templates.push(row);
      return row;
    });
  }

  const tplDel = pathname.match(/^\/api\/templates\/(\d+)$/);
  if (method === 'DELETE' && tplDel) {
    const id = Number(tplDel[1]);
    return saveStore((s) => {
      const before = s.templates.length;
      s.templates = s.templates.filter((t) => t.id !== id);
      if (s.templates.length === before) fail('template not found', 404);
      return { ok: true };
    });
  }

  if (method === 'GET' && pathname === '/api/history') {
    const s = getStoreSync();
    return [...s.history].sort((a, b) =>
      (b.placed_at || '').localeCompare(a.placed_at || '')
    );
  }

  const histDel = pathname.match(/^\/api\/history\/(\d+)$/);
  if (method === 'DELETE' && histDel) {
    const id = Number(histDel[1]);
    return saveStore((s) => {
      const before = s.history.length;
      s.history = s.history.filter((h) => h.id !== id);
      if (s.history.length === before) fail('history not found', 404);
      return { ok: true };
    });
  }

  fail('not found', 404);
}
