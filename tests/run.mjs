// Запуск всех проверок: node tests/run.mjs [имя-набора]
//
// По умолчанию поднимает локальный сервер разработки; чтобы проверить боевой
// сайт — BASE=https://textula.ru/ npm test
//
// Проверки ничего не записывают: в базу не пишут, в бакет не загружают
// (отправка подменяется), читают только публичные данные.

import { spawn } from 'node:child_process';
import { launchBrowser, openPage, sleep } from './driver.mjs';

const SUITES = ['layout', 'game', 'photos', 'seo'];
const only = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:5173/';
const startServer = !process.env.BASE;

async function serverReady(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try { if ((await fetch(url)).ok) return true; } catch { /* ещё поднимается */ }
    await sleep(500);
  }
  return false;
}

const results = [];
let server, browser, page;

try {
  if (startServer) {
    server = spawn('npx', ['vite', '--port', '5173'], { stdio: 'ignore', detached: false });
    if (!await serverReady(BASE)) throw new Error('сервер разработки не поднялся на ' + BASE);
  }

  const suites = [];
  for (const name of SUITES) {
    if (only && name !== only) continue;
    suites.push({ name, module: await import(`./${name}.test.mjs`) });
  }
  if (!suites.length) throw new Error('нет такого набора: ' + only);

  if (suites.some((s) => s.module.needsBrowser !== false)) {
    browser = await launchBrowser();
    page = await openPage();
  }

  for (const { name, module } of suites) {
    const checks = [];
    const check = (title, ok, note = '') => checks.push({ title, ok: !!ok, note });
    const started = Date.now();

    console.log(`\n${module.title || name}`);
    try {
      await module.run({ page, base: BASE, check });
    } catch (error) {
      check('набор дошёл до конца', false, error.message);
    }

    for (const c of checks) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.title}${c.note ? '  [' + c.note + ']' : ''}`);
    }
    results.push({ name, checks, seconds: Math.round((Date.now() - started) / 1000) });
  }

  if (page?.errors.length) {
    console.log('\nОшибки на странице:');
    for (const e of [...new Set(page.errors)]) console.log('  ' + e.split('\n')[0]);
  }
} finally {
  page?.close();
  await browser?.close();
  if (server) server.kill();
}

const failed = results.flatMap((r) => r.checks.filter((c) => !c.ok));
const total = results.reduce((sum, r) => sum + r.checks.length, 0);

console.log(`\nПройдено ${total - failed.length} из ${total}` +
  (failed.length ? `, не прошло ${failed.length}:` : ''));
for (const c of failed) console.log('  ✗ ' + c.title + (c.note ? '  [' + c.note + ']' : ''));

process.exit(failed.length || (page?.errors.length ? 1 : 0));
