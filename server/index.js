import express from 'express';
import cron from 'node-cron';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const KINDS = new Set(['post', 'clip', 'story']);
const NETWORKS = new Set(['vk', 'instagram']);

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const VK_GROUP_TOKEN = process.env.VK_GROUP_TOKEN || '';

const store = createStore(root);
await migrateSqliteIfNeeded(root, store);

const app = express();
app.use(express.json());

app.get('/api/posts', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to required' });
  }
  const rows = store.getPosts(from, to).map((p) => ({
    ...p,
    reminded: p.placed,
  }));
  res.json(rows);
});

app.post('/api/posts', (req, res) => {
  const {
    id,
    text,
    publish_at,
    kind: rawKind,
    network: rawNetwork,
    category: rawCategory,
    placed: rawPlaced,
    reminded: rawReminded,
  } = req.body || {};
  if (typeof text !== 'string' || !publish_at) {
    return res.status(400).json({ error: 'text and publish_at required' });
  }
  const kind = KINDS.has(rawKind) ? rawKind : 'post';
  const network = NETWORKS.has(rawNetwork) ? rawNetwork : 'vk';
  const category =
    typeof rawCategory === 'string' && rawCategory.trim()
      ? rawCategory.trim()
      : 'Другое';

  let placed;
  const flag = rawPlaced !== undefined ? rawPlaced : rawReminded;
  if (flag !== undefined && flag !== null) {
    placed = flag === 1 || flag === true || flag === '1' ? 1 : 0;
  }

  const row = store.upsertPost({
    id,
    text,
    publish_at,
    kind,
    network,
    category,
    placed,
  });
  if (!row) return res.status(404).json({ error: 'post not found' });
  res.status(id != null ? 200 : 201).json({ ...row, reminded: row.placed });
});

app.delete('/api/posts/:id', (req, res) => {
  if (!store.deletePost(req.params.id)) {
    return res.status(404).json({ error: 'post not found' });
  }
  res.json({ ok: true });
});

app.post('/api/me', (req, res) => {
  const { user_id } = req.body || {};
  if (user_id == null) {
    return res.status(400).json({ error: 'user_id required' });
  }
  store.addRecipient(Number(user_id));
  res.json({ ok: true });
});

app.get('/api/templates', (_req, res) => {
  res.json(store.getTemplates());
});

app.post('/api/templates', (req, res) => {
  const { id, category, text } = req.body || {};
  if (typeof category !== 'string' || !category.trim()) {
    return res.status(400).json({ error: 'category required' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text required' });
  }
  const row = store.upsertTemplate({
    id,
    category: category.trim(),
    text: text.trim(),
  });
  if (!row) return res.status(404).json({ error: 'template not found' });
  res.status(id != null ? 200 : 201).json(row);
});

app.delete('/api/templates/:id', (req, res) => {
  if (!store.deleteTemplate(req.params.id)) {
    return res.status(404).json({ error: 'template not found' });
  }
  res.json({ ok: true });
});

app.get('/api/history', (_req, res) => {
  res.json(store.getHistory());
});

const KIND_LABEL = {
  post: 'пост',
  clip: 'клип',
  story: 'сторис',
};

const NETWORK_LABEL = {
  vk: 'VK',
  instagram: 'Instagram',
};

async function sendNotification(userIds, message) {
  if (!VK_GROUP_TOKEN) {
    console.warn('[notify] VK_GROUP_TOKEN не задан, пропуск');
    return false;
  }
  const body = new URLSearchParams({
    user_ids: userIds.join(','),
    message,
    access_token: VK_GROUP_TOKEN,
    v: '5.199',
  });
  try {
    const resp = await fetch(
      'https://api.vk.com/method/secure.sendNotification',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );
    const data = await resp.json();
    if (data.error) {
      console.error('[notify] VK error:', data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notify] request failed:', err.message);
    return false;
  }
}

cron.schedule('* * * * *', async () => {
  const now = new Date().toISOString();
  const due = store.getDueForNotify(now);
  if (due.length === 0) return;

  const recipients = store.getRecipients();
  if (recipients.length === 0) {
    console.warn('[cron] нет recipients — напоминания не отправлены');
    return;
  }

  const userIds = recipients.map((r) => r.user_id);
  const notifiedIds = [];

  for (const post of due) {
    const label = KIND_LABEL[post.kind] || 'пост';
    const net = NETWORK_LABEL[post.network] || 'VK';
    const message = `⏰ [${net}] Пора выложить ${label}: ${post.text.slice(0, 100) || '(без текста)'}`;
    const ok = await sendNotification(userIds, message);
    if (ok) notifiedIds.push(post.id);
  }

  // Только «напомнили». «Размещена» — вручную в приложении.
  if (notifiedIds.length) store.markNotified(notifiedIds);
});

const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log(`JSON store: ${store.path}`);
});

async function migrateSqliteIfNeeded(rootDir, storeApi) {
  const dbPath = join(rootDir, 'data.db');
  const data = storeApi.load();
  if (data.posts.length > 0 || !existsSync(dbPath)) return;

  try {
    const mod = await import('better-sqlite3');
    const Database = mod.default;
    const db = new Database(dbPath, { readonly: true });
    const posts = db.prepare('SELECT * FROM posts').all();
    let templates = [];
    try {
      templates = db.prepare('SELECT * FROM templates').all();
    } catch {
      /* no table */
    }
    const recipients = db.prepare('SELECT * FROM recipients').all();
    db.close();

    storeApi.update((s) => {
      s.posts = posts.map((p) => ({
        id: p.id,
        text: p.text,
        publish_at: p.publish_at,
        placed: p.reminded ? 1 : 0,
        kind: p.kind || 'post',
        network: p.network || 'vk',
      }));
      if (templates.length) {
        s.templates = templates.map((t) => ({
          id: t.id,
          category: t.category,
          text: t.text,
        }));
      }
      s.recipients = recipients.map((r) => ({ user_id: r.user_id }));
      for (const p of s.posts.filter((x) => x.placed === 1)) {
        s.history.push({
          id: s.seq.history++,
          post_id: p.id,
          text: p.text,
          publish_at: p.publish_at,
          placed_at: p.publish_at,
          kind: p.kind,
          network: p.network,
        });
      }
      s.seq.posts = Math.max(s.seq.posts, ...s.posts.map((p) => p.id + 1), 1);
      s.seq.templates = Math.max(
        s.seq.templates,
        ...s.templates.map((t) => t.id + 1),
        1
      );
    });
    console.log('[migrate] data.db → data/store.json');
  } catch (err) {
    console.warn('[migrate] sqlite пропущен:', err.message);
  }
}
