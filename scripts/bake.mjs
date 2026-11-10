/**
 * Запекание игры в один HTML и публикация на GitHub Pages.
 *
 * Использование:  npm run bake
 *
 * Что делает:
 *   1. собирает игру (vite build) → dist/index.html (всё внутри одного файла);
 *   2. копирует его в локальный клон Pages-репо (../romananchugov.github.io/elevatorer/);
 *   3. коммитит и пушит Pages-репо → https://romananchugov.github.io/elevatorer/
 *
 * Требует, чтобы рядом с проектом лежал клон romananchugov.github.io.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = process.cwd();
const pagesRoot = resolve(projectRoot, '..', 'romananchugov.github.io');
const destDir = join(pagesRoot, 'elevatorer');
const destFile = join(destDir, 'index.html');

if (!existsSync(join(pagesRoot, '.git'))) {
  console.error(`✗ Не найден Pages-репо: ${pagesRoot}`);
  process.exit(1);
}

// 1. сборка
console.log('→ сборка...');
execSync('npx vite build', { stdio: 'inherit', cwd: projectRoot });

const built = join(projectRoot, 'dist', 'index.html');
if (!existsSync(built)) {
  console.error('✗ dist/index.html не появился');
  process.exit(1);
}

// 2. проверка самодостаточности: никаких внешних ссылок на ассеты
const html = readFileSync(built, 'utf8');
const external = html.match(/(?:src|href)="(?:https?:)?\/\/[^"]+"/g);
if (external) {
  console.error('✗ В сборке есть внешние ссылки:', external);
  process.exit(1);
}
const kb = (statSync(built).size / 1024).toFixed(1);
console.log(`✓ dist/index.html самодостаточен, ${kb} КБ`);

// 3. копия в Pages-репо
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(built, destFile);

// 4. коммит и пуш
const msg = `elevatorer: сборка ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: pagesRoot });
run(`git add elevatorer/index.html`);
try {
  run(`git commit -m ${JSON.stringify(msg)}`);
} catch {
  console.log('• Изменений нет — пуш пропущен');
  process.exit(0);
}
run('git push origin master');
console.log(`✓ Опубликовано: https://romananchugov.github.io/elevatorer/`);
