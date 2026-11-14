// Браузерный e2e-смоук без зависимостей: поднимает локальный сервер, запускает
// headless Edge/Chrome и общается напрямую по Chrome DevTools Protocol (WebSocket).
// Использование: node tools/e2e.mjs [--require-browser]

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStaticServer } from './dev-server.mjs';

const REQUIRE_BROWSER = process.argv.includes('--require-browser');

/** Ищет установленный Chromium/Edge/Chrome. */
function findBrowser() {
  const fromEnv = process.env.CHROME_BIN || process.env.BROWSER_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  if (process.platform !== 'win32') {
    for (const cmd of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try {
        const resolved = execFileSync('which', [cmd], { encoding: 'utf8' }).trim();
        if (resolved) return resolved;
      } catch {
        // Ищем дальше.
      }
    }
  }

  return null;
}

/** Минимальный CDP-клиент поверх встроенного WebSocket. */
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();

    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        on(event, fn) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(fn);
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id) {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (msg.error) entry.rej(new Error(`${msg.error.code}: ${msg.error.message}`));
        else entry.res(msg.result);
      } else if (msg.method) {
        for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });

    socket.addEventListener('error', reject);
  });
}

/** Ждёт старта DevTools и возвращает HTTP-адрес отладки. */
function launchBrowser(browserPath, userDataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, [
      '--headless',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error(`браузер не поднял DevTools за 20 с: ${stderr}`));
    }, 20_000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) {
        const ws = new URL(match[1]);
        finish(resolve, { child, httpOrigin: `http://${ws.host}` });
      }
    });

    child.on('exit', (code, signal) => {
      finish(reject, new Error(`браузер завершился (code=${code}, signal=${signal}): ${stderr}`));
    });

    child.on('error', (error) => {
      finish(reject, error);
    });
  });
}

async function evalJs(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(`Ошибка в странице: ${exceptionDetails.text ?? JSON.stringify(exceptionDetails)}`);
  }
  return result.value;
}

async function waitFor(cdp, predicate, timeoutMs = 6_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evalJs(cdp, predicate)) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Таймаут ожидания: ${predicate}`);
}

async function run() {
  const browserPath = findBrowser();
  if (!browserPath) {
    const msg = 'Edge/Chrome не найден: браузерный e2e-смоук пропущен';
    if (REQUIRE_BROWSER) throw new Error(msg);
    console.log(msg);
    return;
  }

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const userDataDir = mkdtempSync(join(tmpdir(), 'weather-tree-e2e-'));

  let browser;
  let cdp;

  try {
    browser = await launchBrowser(browserPath, userDataDir);
    const targets = await (await fetch(`${browser.httpOrigin}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page') ?? targets[0];
    assert.ok(page?.webSocketDebuggerUrl, 'не найдена вкладка DevTools');

    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) => {
      errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
    });

    // 1. Десктоп 1440×900 — летний полдень.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const summerQuery = new URLSearchParams({
      demo: '1',
      at: '2026-07-09T12:00:00+03:00',
      code: '0',
      temp: '24',
      cloud: '5',
      wind: '4',
    });
    await cdp.send('Page.navigate', { url: `${baseUrl}/?${summerQuery}` });

    await waitFor(
      cdp,
      "document.getElementById('clock-time')?.textContent === '12:00' && document.getElementById('source')?.textContent === 'демо'",
    );
    await new Promise((r) => setTimeout(r, 150));

    const desktop = await evalJs(cdp, `(() => {
      const scene = document.getElementById('scene');
      const hud = document.querySelector('.hud');
      const bar = document.querySelector('.bar');
      const sr = scene.getBoundingClientRect();
      const hr = hud.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const ctx = scene.getContext('2d');
      const topLeft = ctx.getImageData(0, 0, 1, 1).data;
      const bottomCenter = ctx.getImageData(Math.floor(scene.width / 2), scene.height - 5, 1, 1).data;
      return {
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        cw: scene.width,
        ch: scene.height,
        sr: { w: sr.width, h: sr.height },
        hr: { top: hr.top, left: hr.left, right: hr.right, bottom: hr.bottom },
        br: { top: br.top, left: br.left, right: br.right, bottom: br.bottom },
        differentPixels: topLeft[0] !== bottomCenter[0] || topLeft[1] !== bottomCenter[1] || topLeft[2] !== bottomCenter[2],
      };
    })()`);

    assert.equal(desktop.cw, 360);
    assert.equal(desktop.ch, 225);
    assert.ok(desktop.sr.w >= desktop.innerW && desktop.sr.h >= desktop.innerH, 'сцена должна занимать 100 % экрана');
    assert.equal(desktop.differentPixels, true, 'на canvas должен быть отрендерен пейзаж');
    assert.ok(desktop.hr.top >= 0 && desktop.hr.bottom <= desktop.innerH);
    assert.ok(desktop.br.top >= 0 && desktop.br.bottom <= desktop.innerH);
    assert.ok(desktop.hr.right <= desktop.br.left || desktop.hr.bottom <= desktop.br.top, 'HUD и панель не должны пересекаться');

    // Проверка переключения языка RU <-> EN.
    await evalJs(cdp, "document.getElementById('lang-btn').click()");
    assert.equal(await evalJs(cdp, "document.getElementById('lang-btn').textContent"), 'EN');
    assert.equal(await evalJs(cdp, "document.getElementById('label-wind').textContent"), 'Wind');
    await evalJs(cdp, "document.getElementById('lang-btn').click()");
    assert.equal(await evalJs(cdp, "document.getElementById('lang-btn').textContent"), 'RU');
    assert.equal(await evalJs(cdp, "document.getElementById('label-wind').textContent"), 'Ветер');

    // Проверка диалога выбора города.
    await evalJs(cdp, "document.getElementById('place-btn').click()");
    assert.equal(await evalJs(cdp, "document.getElementById('place-dialog').open"), true);
    await evalJs(cdp, "document.querySelector('.dialog__close').click()");
    assert.equal(await evalJs(cdp, "document.getElementById('place-dialog').open"), false);

    // 2. Мобильный портрет 390×844 — зимняя метель.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    const winterQuery = new URLSearchParams({
      demo: '1',
      at: '2026-01-14T19:15:00+03:00',
      code: '75',
      temp: '-11',
      cloud: '95',
      wind: '28',
      gust: '45',
    });
    await cdp.send('Page.navigate', { url: `${baseUrl}/?${winterQuery}` });

    await waitFor(
      cdp,
      "document.getElementById('clock-time')?.textContent === '19:15' && document.getElementById('temp')?.textContent.includes('11')",
    );
    await new Promise((r) => setTimeout(r, 150));

    const mobile = await evalJs(cdp, `(() => {
      const scene = document.getElementById('scene');
      const sr = scene.getBoundingClientRect();
      const hr = document.querySelector('.hud').getBoundingClientRect();
      const br = document.querySelector('.bar').getBoundingClientRect();
      return {
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        cw: scene.width,
        ch: scene.height,
        sr: { w: sr.width, h: sr.height },
        hr: { top: hr.top, right: hr.right, bottom: hr.bottom },
        br: { top: br.top, right: br.right, bottom: br.bottom },
        temp: document.getElementById('temp').textContent,
      };
    })()`);

    assert.equal(mobile.cw, 195);
    assert.equal(mobile.ch, 422);
    assert.ok(mobile.sr.w >= mobile.innerW && mobile.sr.h >= mobile.innerH, JSON.stringify(mobile));
    assert.ok(mobile.hr.bottom < mobile.br.top, 'на телефоне HUD и нижняя плашка не должны перекрываться');
    assert.ok(mobile.hr.right <= mobile.innerW && mobile.br.right <= mobile.innerW);
    assert.match(mobile.temp, /−11°/);

    assert.deepEqual(errors, [], `ошибки в браузере: ${errors.join('; ')}`);
    console.log(`e2e ok (${browserPath}): desktop 1440x900 (${desktop.cw}x${desktop.ch}), mobile 390x844 (${mobile.cw}x${mobile.ch})`);
  } finally {
    if (cdp) {
      try {
        await cdp.send('Browser.close');
      } catch {
        // Браузер мог уже закрыться.
      }
      cdp.close();
    }
    if (browser?.child) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          browser.child.kill();
          resolve();
        }, 1500);
        browser.child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    server.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // На Windows Edge может ещё пару мс держать лок на профиле.
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
