// Точка входа: точка → погода → WorldState → HUD.
// На M2 сюда добавится рендер сцены, на M3–M5 — слои.

import { STORAGE_KEYS, WEATHER } from './config.js';
import { fetchStation } from './api/openMeteo.js';
import { readJson, writeJson } from './state/storage.js';
import { isValidPlace, resolvePlace, samePlace, savePlace } from './state/place.js';
import { buildWorldState } from './state/world.js';
import { demoStation } from './state/demo.js';
import { createStage } from './ui/stage.js';
import { createHud } from './ui/hud.js';
import { createPlaceDialog } from './ui/controls.js';

const REASON_TEXT = {
  timeout: 'сервер не ответил',
  network: 'нет соединения',
  'http:429': 'превышен лимит запросов',
  shape: 'неожиданный ответ сервиса',
};

const humanReason = (reason) => REASON_TEXT[reason] ?? String(reason);

const state = {
  place: null,
  station: null,
  world: null,
  inflight: null,
  lastFetchAt: 0,
};

const canvas = document.getElementById('scene');
const stageHolder = document.getElementById('stage');
const hud = createHud(document);
const stage = createStage(canvas, stageHolder);

let refreshTimer = null;

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
  state.world = buildWorldState(station);

  hud.setPlace(station.place ?? state.place);
  hud.setStation(station, { source, fetchedAt: station.fetchedAt });
  hud.setMessage(null);
}

async function loadWeather() {
  if (!state.place) return;
  if (state.inflight) return state.inflight;

  if (!state.station) hud.setSource('loading');

  state.inflight = (async () => {
    const result = await fetchStation(state.place);

    if (result.ok) {
      applyStation(result.station, 'live');
      writeJson(STORAGE_KEYS.station, result.station);
      return;
    }

    const cached = readCachedStation();
    if (cached && samePlace(cached.place, state.place)) {
      applyStation(cached, 'cache');
      hud.setMessage(`Погода не обновилась: ${humanReason(result.reason)}. Показаны последние данные.`);
      return;
    }

    hud.setSource('error');
    hud.setMessage(`Не удалось получить погоду: ${humanReason(result.reason)}.`);
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
    hud.setPlace(place);
    await loadWeather();
  },
);

document.getElementById('place-btn').addEventListener('click', () => placeDialog.open());
document.getElementById('refresh-btn').addEventListener('click', () => loadWeather());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  hud.tick();
  if (Date.now() - state.lastFetchAt > WEATHER.staleAfterMs) loadWeather();
});

// Часы тикают независимо от погоды: даже без сети экран жив.
function frame() {
  hud.tick();
  requestAnimationFrame(frame);
}

async function start() {
  hud.setSource('loading');
  requestAnimationFrame(frame);

  // ?demo=1 — офлайн-режим для разработки и скриншотов, без единого запроса в сеть.
  if (new URLSearchParams(location.search).has('demo')) {
    const station = demoStation();
    state.place = station.place;
    hud.setPlace(station.place);
    applyStation(station, 'demo');
    return;
  }

  const { place } = await resolvePlace();
  state.place = place;
  hud.setPlace(place);

  const cached = readCachedStation();
  if (cached && samePlace(cached.place, place)) applyStation(cached, 'cache');

  await loadWeather();
  scheduleRefresh();
}

start();
