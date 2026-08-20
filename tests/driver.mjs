// Управление headless-браузером по протоколу Chrome DevTools.
//
// Зачем свой драйвер, а не playwright: проекту хватает одного браузера и
// нескольких десятков строк, а лишняя зависимость в репозитории без сборки
// стоит дороже, чем эти строки.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean);

const PORT = Number(process.env.CDP_PORT || 9333);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome не найден. Укажите путь в переменной CHROME.');
  return found;
}

export async function launchBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'textula-test-'));
  const child = spawn(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    try {
      ready = (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok;
    } catch { /* ещё не поднялся */ }
    if (!ready) await sleep(250);
  }

  if (!ready) {
    child.kill();
    fs.rmSync(profile, { recursive: true, force: true });
    throw new Error(`Браузер не открыл порт ${PORT} за 30 секунд. ` +
      'Возможно, порт занят другим Chrome — задайте другой в CDP_PORT.');
  }

  return {
    async close() {
      // Ждём, пока браузер отпустит файлы профиля: иначе удаление падает на
      // недописанном кэше.
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, sleep(3000)]);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}

// Одна вкладка со всем, что нужно проверкам.
export async function openPage() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const errors = [];
  const images = [];

  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '');
    }
    if (msg.method === 'Network.responseReceived' && msg.params.type === 'Image') {
      images.push({ url: msg.params.response.url, size: 0 });
    }
    if (msg.method === 'Network.loadingFinished') {
      const last = images[images.length - 1];
      if (last && !last.size) last.size = msg.params.encodedDataLength;
    }
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  const page = {
    errors,
    images,
    send,

    // Выполнить выражение на странице и вернуть результат.
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      const failed = r.result?.exceptionDetails;
      if (failed) throw new Error(failed.exception?.description || failed.text || 'ошибка на странице');
      return r.result?.result?.value;
    },

    // Дождаться, пока выражение станет истинным. Исключения по дороге —
    // нормальная часть ожидания: скрипт мог ещё не выполниться.
    async waitFor(expression, { timeout = 30000, label } = {}) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try { if (await page.eval(expression)) return true; } catch { /* ещё рано */ }
        await sleep(150);
      }
      throw new Error('не дождались: ' + (label || expression));
    },

    async viewport(width, height, { mobile = width < 769, scale = 2 } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
    },

    async resetViewport() {
      await send('Emulation.clearDeviceMetricsOverride');
    },

    // Открыть приложение, пропустив онбординг. Флаг ставится на том же домене,
    // что и проверяемая страница, иначе онбординг перекроет интерфейс.
    async openApp(base) {
      images.length = 0;
      await send('Page.navigate', { url: base });
      await sleep(1500);
      await page.eval(`localStorage.setItem('textula_onboarding', Date.now().toString());
                       localStorage.removeItem('guessStats')`);
      images.length = 0;
      await send('Page.navigate', { url: base });
      await page.waitFor('window.appStarted && details.length > 0', { timeout: 40000, label: 'запуск карты' });
      await sleep(600);
    },

    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },

    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },

    close() { ws.close(); }
  };

  return page;
}
