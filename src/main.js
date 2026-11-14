// Точка входа: связывает контроллер данных, рендер-цикл, HUD, язык и диалог города.

import { STORAGE_KEYS } from './config.js';
import { createWeatherController } from './state/controller.js';
import { readJson, writeJson } from './state/storage.js';
import { describeScene } from './model/describe.js';
import { dict, normalizeLang } from './model/i18n.js';
import { Surface } from './render/surface.js';
import { clearSceneCache, renderScene } from './render/scene.js';
import { createStage } from './ui/stage.js';
import { createFrameGuard, createFramePacer } from './ui/loop.js';
import { createHud } from './ui/hud.js';
import { createPlaceDialog } from './ui/controls.js';
import { createChrome } from './ui/chrome.js';

/**
 * @param {URLSearchParams} params
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function numberParam(params, name, fallback) {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const params = new URLSearchParams(location.search);
let lang = normalizeLang(params.get('lang') ?? readJson(STORAGE_KEYS.lang));
document.documentElement.lang = lang;

const canvas = document.getElementById('scene');
const stageHolder = document.getElementById('stage');
const hud = createHud(document, { lang });

let dirty = true;
const stage = createStage(canvas, stageHolder, {
  onResize: () => {
    dirty = true;
  },
});

// Пиксельный буфер живёт отдельно от DOM: его можно отрендерить и в Node.
const initialSize = stage.size();
let surface = new Surface(initialSize.width, initialSize.height);
let scratch = new Surface(initialSize.width, initialSize.height);
stage.paintPlaceholder();

/**
 * Время сцены. `?demo=1&at=2026-01-14T19:15` включает «машину времени»:
 * и часы, и небо, и погода показывают выбранный момент.
 */
let timeShiftMs = 0;
const sceneNow = () => Date.now() + timeShiftMs;

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const frameGuard = createFrameGuard({ maxErrors: 3 });
const framePacer = createFramePacer({ maxFps: 60 });

let currentWorld = null;
let transition = null;
let stopped = false;

/**
 * Новый мир показываем не скачком: старый кадр растворяется в новом
 * по дизерингу Байера (~2.5 с). Смена города — быстрее.
 * @param {object} world
 * @param {number} [duration]
 */
function setWorld(world, duration = 2500) {
  if (!world) return;
  hud.setSun(world.sun);
  canvas.setAttribute('aria-label', describeScene(world, lang));

  if (!currentWorld || duration <= 0 || reducedMotion) {
    currentWorld = world;
    transition = null;
    dirty = true;
    return;
  }
  transition = { from: currentWorld, to: world, startedAt: performance.now(), duration };
  dirty = true;
}

const controller = createWeatherController({
  sceneNow,
  isHidden: () => document.hidden,
  getLang: () => lang,
  kpOverride: Number.isFinite(numberParam(params, 'kp', NaN)) ? numberParam(params, 'kp', 0) : null,
  onPlace: (place) => hud.setPlace(place),
  onStation: (station, meta) => hud.setStation(station, meta),
  onWorld: (world, duration) => setWorld(world, duration),
  onSource: (source) => hud.setSource(source),
  onSourceHint: (hint) => hud.setSourceHint(hint),
  onMessage: (message) => hud.setMessage(message),
});

const chrome = createChrome({
  document,
  button: document.getElementById('focus-btn'),
  stage: stageHolder,
  getLabels: () => dict(lang).hud,
});
// ?hud=0 — сцена без интерфейса сразу, без клика. Полный экран требует жеста,
// поэтому в этом случае остаётся обычное окно.
if (params.get('hud') === '0') chrome.setVisible(false);

const placeDialog = createPlaceDialog(  {
    dialog: document.getElementById('place-dialog'),
    input: document.getElementById('place-input'),
    results: document.getElementById('place-results'),
    status: document.getElementById('place-status'),
    title: document.getElementById('place-title'),
    searchLabel: document.getElementById('place-search-label'),
    closeBtn: document.getElementById('place-close'),
  },
  (place) => controller.selectPlace(place),
  { getLang: () => lang },
);

function setLanguage(nextLang) {
  lang = normalizeLang(nextLang);
  writeJson(STORAGE_KEYS.lang, lang);
  document.documentElement.lang = lang;
  hud.setLang(lang);
  placeDialog.setLang();
  chrome.sync();
  if (currentWorld) canvas.setAttribute('aria-label', describeScene(currentWorld, lang));
  const provider = controller.state.provider;
  if (provider) hud.setSourceHint(dict(lang).hud.providerHint(provider));
}

document.getElementById('place-btn').addEventListener('click', () => placeDialog.open());
document.getElementById('refresh-btn').addEventListener('click', () => controller.loadWeather());
document.getElementById('lang-btn').addEventListener('click', () => {
  setLanguage(lang === 'ru' ? 'en' : 'ru');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  hud.tick(sceneNow());
  controller.refreshIfDue();
});

// Сбрасываем кэши и таймеры при уходе со страницы.
window.addEventListener('pagehide', () => {
  controller.dispose();
  clearSceneCache();
});

function frame(now) {
  if (stopped) return;

  const at = sceneNow();
  hud.tick(at);

  // Во время перехода мир не пересобираем, иначе кроссфейд «сломается».
  if (!transition) {
    const nextWorld = controller.rebuildIfDue(at);
    if (nextWorld) {
      currentWorld = nextWorld;
      hud.setSun(nextWorld.sun);
      canvas.setAttribute('aria-label', describeScene(nextWorld, lang));
    }
  }

  if (currentWorld && (dirty || framePacer.shouldDraw(now))) {
    dirty = false;
    const { width, height } = stage.size();
    if (surface.width !== width || surface.height !== height) {
      surface = new Surface(width, height);
      scratch = new Surface(width, height);
    }

    const drawn = frameGuard.attempt(() => {
      const animMs = reducedMotion ? 0 : now;

      if (transition && !reducedMotion) {
        const progress = Math.min(1, (now - transition.startedAt) / transition.duration);
        renderScene(surface, transition.from, at, animMs);
        renderScene(scratch, transition.to, at, animMs);
        surface.dissolve(scratch, progress);
        if (progress >= 1) {
          currentWorld = transition.to;
          transition = null;
        }
      } else {
        renderScene(surface, currentWorld, at, animMs);
      }

      stage.present(surface);
    });

    if (!drawn && frameGuard.exhausted) {
      stopped = true;
      stage.paintPlaceholder();
      hud.setMessage(dict(lang).hud.renderStopped);
      return;
    }
  }

  requestAnimationFrame(frame);
}

async function start() {
  hud.setSource('loading');
  requestAnimationFrame(frame);

  // ?demo=1 — офлайн-режим для разработки и скриншотов, без единого запроса в сеть.
  if (params.has('demo')) {
    const atParam = params.get('at');
    const atMs = atParam ? Date.parse(atParam) : Date.now();
    if (Number.isFinite(atMs) && atParam) timeShiftMs = atMs - Date.now();

    const defaultName = lang === 'en' ? 'Moscow' : 'Москва';
    const defaultCountry = lang === 'en' ? 'Russia' : 'Россия';
    const place = {
      name: params.get('name') ?? defaultName,
      country: params.get('country') ?? defaultCountry,
      lat: numberParam(params, 'lat', 55.7558),
      lon: numberParam(params, 'lon', 37.6173),
      timeZone: params.get('tz') ?? 'Europe/Moscow',
    };

    const overrides = {};
    for (const [param, field] of [
      ['temp', 'tempC'],
      ['code', 'code'],
      ['cloud', 'cloudPct'],
      ['wind', 'windKmh'],
      ['gust', 'gustKmh'],
      ['humidity', 'humidity'],
    ]) {
      const value = numberParam(params, param, NaN);
      if (Number.isFinite(value)) overrides[field] = value;
    }

    controller.startDemo({ place, atMs, overrides });
    return;
  }

  await controller.startLive();
}

start();

// Офлайн-оболочка только на проде: на localhost кэш мешает разработке.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Регистрация не критична: без неё приложение просто не работает офлайн.
    });
  });
}
