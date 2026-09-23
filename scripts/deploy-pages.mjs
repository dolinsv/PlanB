import { spawnSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

process.env.VITE_STATIC = 'true';
process.env.GH_PAGES = 'true';
process.env.VITE_BASE = '/PlanB/';

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

run('npx', ['gh-pages', '-d', 'dist', '--nojekyll']);
console.log('Published: https://dolinsv.github.io/PlanB/');
