import express from 'express';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const KINDS = new Set(['post', 'clip', 'story']);
const NETWORKS = new Set(['vk', 'instagram']);
const PORT = Number(process.env.PORT) || 3000;

const store = createStore(root);

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

app.delete('/api/history/:id', (req, res) => {
  if (!store.deleteHistory(req.params.id)) {
    return res.status(404).json({ error: 'history not found' });
  }
  res.json({ ok: true });
});

app.get('/api/categories', (_req, res) => {
  res.json(store.getCategories());
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body || {};
  const result = store.addCategory(name);
  if (result?.error) {
    const status =
      result.error === 'already exists' ? 409 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.status(201).json(result.categories);
});

app.put('/api/categories', (req, res) => {
  const { from, to } = req.body || {};
  const result = store.renameCategory(from, to);
  if (result?.error) {
    const status =
      result.error === 'not found'
        ? 404
        : result.error === 'already exists'
          ? 409
          : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json(result.categories);
});

app.delete('/api/categories', (req, res) => {
  const name = req.query.name || req.body?.name;
  const result = store.deleteCategory(name);
  if (result?.error) {
    const status =
      result.error === 'not found'
        ? 404
        : result.error === 'cannot delete default' ||
            result.error === 'last category'
          ? 400
          : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json(result.categories);
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
