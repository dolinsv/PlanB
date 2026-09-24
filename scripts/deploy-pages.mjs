import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const APP_BUILD = String(Date.now());
process.env.VITE_STATIC = 'true';
process.env.GH_PAGES = 'true';
process.env.VITE_BASE = '/PlanB/';
process.env.VITE_APP_BUILD = APP_BUILD;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('npx', ['vite', 'build']);

const dist = join(root, 'dist');
const index = join(dist, 'index.html');
if (existsSync(index)) {
  copyFileSync(index, join(dist, '404.html'));
}

writeFileSync(
  join(dist, 'version.json'),
  JSON.stringify({ build: APP_BUILD }, null, 0),
  'utf8'
);

run('npx', ['gh-pages', '-d', 'dist', '--nojekyll']);
console.log(`Published: https://dolinsv.github.io/PlanB/ (build ${APP_BUILD})`);
