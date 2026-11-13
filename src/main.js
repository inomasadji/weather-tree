// Точка входа: точка → погода → WorldState → HUD.
// На M2 сюда добавится рендер сцены, на M3–M5 — слои.

import { LOGICAL, STORAGE_KEYS, WEATHER } from './config.js';
import { fetchWeather } from './api/weather.js';
import { readJson, writeJson } from './state/storage.js';
import { isValidPlace, resolvePlace, samePlace, savePlace } from './state/place.js';
import { buildWorldState, buildAmbientWorld } from './state/world.js';
import { demoStation } from './state/demo.js';
import { describeScene } from './model/describe.js';
import { Surface } from './render/surface.js';
import { renderScene } from './render/scene.js';
import { createStage } from './ui/stage.js';
import { createHud } from './ui/hud.js';
import { createPlaceDialog } from './ui/controls.js';

const REASON_TEXT = {
  timeout: 'сервис погоды не ответил',
  network: 'нет соединения с сервисом погоды',
  parse: 'сервис вернул непонятный ответ',
  'http:429': 'превышен лимит запросов',
  shape: 'неожиданный ответ сервиса',
};

const humanReason = (reason) => REASON_TEXT[reason] ?? String(reason);

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

const state = {
  place: null,
  station: null,
  world: null,
  provider: null,
  inflight: null,
  lastFetchAt: 0,
  failures: 0,
};

const canvas = document.getElementById('scene');
const stageHolder = document.getElementById('stage');
const hud = createHud(document);
const stage = createStage(canvas, stageHolder);

// Пиксельный буфер живёт отдельно от DOM: его можно отрендерить и в Node.
const surface = new Surface(LOGICAL.width, LOGICAL.height);
stage.paintPlaceholder();

let refreshTimer = null;

/**
 * Время сцены. `?demo=1&at=2026-01-14T19:15` включает «машину времени»:
 * и часы, и небо, и погода показывают выбранный момент.
 */
let timeShiftMs = 0;
let demoMode = false;
const sceneNow = () => Date.now() + timeShiftMs;

/** Кэш погоды годится, только если он про ту же точку и не старше суток. */
function readCachedStation() {
  const cached = readJson(STORAGE_KEYS.station);
  if (!cached || !cached.current || !isValidPlace(cached.place)) return null;
  if (typeof cached.fetchedAt !== 'number') return null;
  if (Date.now() - cached.fetchedAt > WEATHER.cacheTtlMs) return null;
  return cached;
}

function applyStation(station, source) {
  state.station = station;
  state.lastFetchAt = station.fetchedAt;
  state.provider = station.provider ?? state.provider;
  // Мир строим на времени сцены, иначе в демо-режиме астрономия разъедется с часами.
  state.world = buildWorldState(station, sceneNow());

  hud.setPlace(station.place ?? state.place);
  hud.setStation(station, {
    source,
    fetchedAt: source === 'demo' ? null : station.fetchedAt,
  });
  hud.setSourceHint(state.provider ? `источник: ${state.provider}` : null);
  hud.setMessage(null);

  if (state.world) {
    canvas.setAttribute('aria-label', describeScene(state.world));
  }
}

let retryTimer = null;

function clearRetry() {
  if (!retryTimer) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

/** Если данных нет вообще — не ждём десять минут, пробуем ещё раз через 45 с. */
function scheduleRetry() {
  if (retryTimer || state.failures >= WEATHER.retryBudget) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!document.hidden) loadWeather();
  }, WEATHER.retryAfterFailureMs);
}

async function loadWeather() {
  if (!state.place || demoMode) return;
  if (state.inflight) return state.inflight;

  if (!state.station) hud.setSource('loading');

  state.inflight = (async () => {
    const result = await fetchWeather(state.place);

    if (result.ok) {
      state.failures = 0;
      clearRetry();
      applyStation(result.station, 'live');
      writeJson(STORAGE_KEYS.station, result.station);
      return;
    }

    state.failures += 1;

    const cached = readCachedStation();
    if (cached && samePlace(cached.place, state.place)) {
      applyStation(cached, 'cache');
      hud.setMessage(`Погода не обновилась: ${humanReason(result.reason)}. Показаны последние данные.`);
    } else {
      hud.setSource('error');
      hud.setMessage(`Не удалось получить погоду: ${humanReason(result.reason)}.`);
    }

    scheduleRetry();
  })().finally(() => {
    state.inflight = null;
  });

  return state.inflight;
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden) loadWeather();
  }, WEATHER.refreshMs);
}

const placeDialog = createPlaceDialog(
  {
    dialog: document.getElementById('place-dialog'),
    input: document.getElementById('place-input'),
    results: document.getElementById('place-results'),
    status: document.getElementById('place-status'),
  },
  async (place) => {
    savePlace(place);
    state.place = place;
    state.station = null;
    state.failures = 0;
    clearRetry();
    hud.setPlace(place);
    await loadWeather();
  },
);

document.getElementById('place-btn').addEventListener('click', () => placeDialog.open());
document.getElementById('refresh-btn').addEventListener('click', () => loadWeather());

/**
 * Время сцены. `?demo=1&at=2026-01-14T19:15` включает «машину времени»:
 * и часы, и небо, и погода показывают выбранный момент.
 */
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let lastWorldBuild = 0;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  hud.tick(sceneNow());
  if (demoMode) return;
  if (Date.now() - state.lastFetchAt > WEATHER.staleAfterMs) loadWeather();
});

// Часы тикают независимо от погоды, сцена перерисовывается каждый кадр:
// небо и земля — из кэша, облака и мерцание звёзд — живые.
function frame(now) {
  const at = sceneNow();
  hud.tick(at);

  // Раз в минуту пересобираем мир: солнце успевает сместиться, «день/ночь» — тоже.
  if (state.station && at - lastWorldBuild > 60_000) {
    state.world = buildWorldState(state.station, at);
    lastWorldBuild = at;
    canvas.setAttribute('aria-label', describeScene(state.world));
  }

  if (state.world) {
    // При reduced-motion кадр остаётся правильным, но замирает.
    renderScene(surface, state.world, at, reducedMotion ? 0 : now);
    stage.present(surface);
  }

  requestAnimationFrame(frame);
}

async function start() {
  hud.setSource('loading');
  requestAnimationFrame(frame);

  // ?demo=1 — офлайн-режим для разработки и скриншотов, без единого запроса в сеть.
  // Дополнительно: &at=2026-01-14T19:15, &code=75, &temp=-11, &cloud=95, &wind=28.
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) {
    demoMode = true;
    const atParam = params.get('at');
    const atMs = atParam ? Date.parse(atParam) : Date.now();
    if (Number.isFinite(atMs) && atParam) timeShiftMs = atMs - Date.now();

    const place = {
      name: params.get('name') ?? 'Москва',
      country: params.get('country') ?? 'Россия',
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

    const station = demoStation(place, { atMs, weather: overrides });
    state.place = station.place;
    hud.setPlace(station.place);
    applyStation(station, 'demo');
    return;
  }

  const { place } = await resolvePlace();
  state.place = place;
  state.world = buildAmbientWorld(place);
  hud.setPlace(place);

  const cached = readCachedStation();
  if (cached && samePlace(cached.place, place)) applyStation(cached, 'cache');

  await loadWeather();
  scheduleRefresh();
}

start();
