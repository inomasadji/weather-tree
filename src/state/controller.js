// Контроллер данных: место, кэш, загрузка погоды, ретраи и периодическое обновление.
// Не знает о DOM и пикселях — вся связь с экраном идёт через колбэки.

import { STORAGE_KEYS, WEATHER } from '../config.js';
import { fetchWeather as defaultFetchWeather } from '../api/weather.js';
import { readJson, writeJson } from './storage.js';
import {
  isValidPlace,
  resolvePlace as defaultResolvePlace,
  samePlace,
  savePlace as defaultSavePlace,
} from './place.js';
import { buildAmbientWorld, buildWorldState } from './world.js';
import { demoStation } from './demo.js';

const REASON_TEXT = {
  timeout: 'сервис погоды не ответил',
  network: 'нет соединения с сервисом погоды',
  parse: 'сервис вернул непонятный ответ',
  'http:429': 'превышен лимит запросов',
  shape: 'неожиданный ответ сервиса',
};

export const humanReason = (reason) => REASON_TEXT[reason] ?? String(reason);

/**
 * Читает сохранённый ответ станции, если он валиден и не старше суток.
 * @param {number} [nowMs]
 * @returns {object|null}
 */
export function readCachedStation(nowMs = Date.now()) {
  const cached = readJson(STORAGE_KEYS.station);
  if (!cached || !cached.current || !isValidPlace(cached.place)) return null;
  if (typeof cached.fetchedAt !== 'number') return null;
  if (nowMs - cached.fetchedAt > WEATHER.cacheTtlMs) return null;
  return cached;
}

/**
 * @param {object} [options]
 */
export function createWeatherController(options = {}) {
  const {
    fetchWeather = defaultFetchWeather,
    resolvePlace = defaultResolvePlace,
    savePlace = defaultSavePlace,
    readCache = () => readCachedStation(),
    writeCache = (station) => writeJson(STORAGE_KEYS.station, station),
    sceneNow = () => Date.now(),
    isHidden = () => false,
    onPlace = () => {},
    onStation = () => {},
    onWorld = () => {},
    onSource = () => {},
    onSourceHint = () => {},
    onMessage = () => {},
  } = options;

  const state = {
    place: null,
    station: null,
    provider: null,
    inflight: null,
    lastFetchAt: 0,
    lastWorldBuild: 0,
    failures: 0,
    demoMode: false,
  };

  let refreshTimer = null;
  let retryTimer = null;

  function clearRetry() {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    if (retryTimer || state.failures >= WEATHER.retryBudget) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!isHidden()) loadWeather();
    }, WEATHER.retryAfterFailureMs);
  }

  function applyStation(station, source) {
    state.station = station;
    state.lastFetchAt = station.fetchedAt;
    state.provider = station.provider ?? state.provider;

    const at = sceneNow();
    const world = buildWorldState(station, at);
    state.lastWorldBuild = at;

    onWorld(world, source === 'demo' ? 0 : 2500);
    onPlace(station.place ?? state.place);
    onStation(station, {
      source,
      fetchedAt: source === 'demo' ? null : station.fetchedAt,
    });
    onSourceHint(state.provider ? `источник: ${state.provider}` : null);
    onMessage(null);
  }

  async function loadWeather() {
    if (!state.place || state.demoMode) return;
    if (state.inflight) return state.inflight;

    if (!state.station) onSource('loading');

    state.inflight = (async () => {
      const result = await fetchWeather(state.place);

      if (result.ok) {
        state.failures = 0;
        clearRetry();
        applyStation(result.station, 'live');
        writeCache(result.station);
        return;
      }

      state.failures += 1;

      const cached = readCache();
      if (cached && samePlace(cached.place, state.place)) {
        applyStation(cached, 'cache');
        onMessage(`Погода не обновилась: ${humanReason(result.reason)}. Показаны последние данные.`);
      } else {
        onSource('error');
        onMessage(`Не удалось получить погоду: ${humanReason(result.reason)}.`);
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
      if (!isHidden()) loadWeather();
    }, WEATHER.refreshMs);
  }

  async function selectPlace(place) {
    savePlace(place);
    state.place = place;
    state.station = null;
    state.failures = 0;
    clearRetry();
    onPlace(place);

    // Сначала нейтральный кадр новой точки, потом погода — так переход мягче.
    const ambient = buildAmbientWorld(place);
    onWorld(ambient, 600);
    onMessage('Погода загружается…');
    await loadWeather();
  }

  function startDemo({ place, atMs, overrides }) {
    state.demoMode = true;
    const station = demoStation(place, { atMs, weather: overrides });
    state.place = station.place;
    onPlace(station.place);
    applyStation(station, 'demo');
  }

  async function startLive() {
    const { place } = await resolvePlace();
    state.place = place;

    // До прихода погоды — нейтральный кадр, а не уверенное «ясно».
    const ambient = buildAmbientWorld(place);
    onWorld(ambient, 0);
    onPlace(place);
    onMessage('Погода загружается…');

    const cached = readCache();
    if (cached && samePlace(cached.place, place)) applyStation(cached, 'cache');

    await loadWeather();
    scheduleRefresh();
  }

  function refreshIfDue() {
    if (state.demoMode) return;
    if (Date.now() - state.lastFetchAt > WEATHER.staleAfterMs) loadWeather();
  }

  /**
   * Раз в минуту пересобираем мир: солнце смещается, «день/ночь» обновляется.
   * @param {number} at
   */
  function rebuildIfDue(at) {
    if (!state.station || at - state.lastWorldBuild <= 60_000) return null;
    state.lastWorldBuild = at;
    return buildWorldState(state.station, at);
  }

  function dispose() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    clearRetry();
  }

  return {
    state,
    loadWeather,
    selectPlace,
    startDemo,
    startLive,
    refreshIfDue,
    rebuildIfDue,
    dispose,
  };
}
