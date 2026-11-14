// Контроллер данных: место, кэш, загрузка погоды, ретраи и периодическое обновление.
// Не знает о DOM и пикселях — вся связь с экраном идёт через колбэки.

import { STORAGE_KEYS, WEATHER } from '../config.js';
import { fetchWeather as defaultFetchWeather } from '../api/weather.js';
import { fetchKp as defaultFetchKp } from '../api/aurora.js';
import { readJson, writeJson } from './storage.js';
import {
  isValidPlace,
  resolvePlace as defaultResolvePlace,
  samePlace,
  savePlace as defaultSavePlace,
} from './place.js';
import { buildAmbientWorld, buildWorldState } from './world.js';
import { demoStation } from './demo.js';
import { classifyPrecipitation } from '../model/conditions.js';
import { dict, normalizeLang } from '../model/i18n.js';

export const humanReason = (reason, lang = 'ru') => dict(lang).reasons[reason] ?? String(reason);

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
    fetchKp = defaultFetchKp,
    kpOverride = null,
    resolvePlace = defaultResolvePlace,
    savePlace = defaultSavePlace,
    readCache = () => readCachedStation(),
    writeCache = (station) => writeJson(STORAGE_KEYS.station, station),
    sceneNow = () => Date.now(),
    isHidden = () => false,
    getLang = () => 'ru',
    onPlace = () => {},
    onStation = () => {},
    onWorld = () => {},
    onSource = () => {},
    onSourceHint = () => {},
    onMessage = () => {},
  } = options;

  const lang = () => normalizeLang(getLang());

  const state = {
    place: null,
    station: null,
    provider: null,
    inflight: null,
    lastFetchAt: 0,
    lastWorldBuild: 0,
    lastRainAtMs: 0,
    lastRainIntensity: 0,
    kp: kpOverride ?? 0,
    failures: 0,
    demoMode: false,
  };

  let refreshTimer = null;
  let retryTimer = null;
  let auroraTimer = null;

  const AURORA_REFRESH_MS = 30 * 60_000;

  /** Kp нужен только сиянию: ошибка сети здесь ничего не ломает. */
  async function loadAurora() {
    if (kpOverride !== null) {
      state.kp = kpOverride;
      return;
    }

    const result = await fetchKp();
    if (!result.ok) return;

    if (result.kp !== state.kp) {
      state.kp = result.kp;
      // Мир пересоберётся в ближайшую минуту — сияние появится или погаснет.
      state.lastWorldBuild = 0;
    }
  }

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

  /** Сколько минут назад шёл дождь: сцена досыхает после осадков. */
  function sinceRainMin(at) {
    if (!state.lastRainAtMs) return Number.POSITIVE_INFINITY;
    return Math.max(0, (at - state.lastRainAtMs) / 60_000);
  }

  function applyStation(station, source) {
    state.station = station;
    state.lastFetchAt = station.fetchedAt;
    state.provider = station.provider ?? state.provider;

    const at = sceneNow();
    const precip = classifyPrecipitation(station.current?.code ?? 0, station.current?.tempC ?? 10);
    if (precip.type === 'rain' || precip.type === 'drizzle') {
      state.lastRainAtMs = at;
      state.lastRainIntensity = precip.intensity;
    }

    const world = buildWorldState(station, at, {
      sinceRainMin: sinceRainMin(at),
      lastRainIntensity: state.lastRainIntensity,
      kp: state.kp,
    });
    state.lastWorldBuild = at;

    onWorld(world, source === 'demo' ? 0 : 2500);
    onPlace(station.place ?? state.place);
    onStation(station, {
      source,
      fetchedAt: source === 'demo' ? null : station.fetchedAt,
    });
    onSourceHint(state.provider ? dict(lang()).hud.providerHint(state.provider) : null);
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
      const reason = humanReason(result.reason, lang());
      if (cached && samePlace(cached.place, state.place)) {
        applyStation(cached, 'cache');
        onMessage(dict(lang()).messages.staleCache(reason));
      } else {
        onSource('error');
        onMessage(dict(lang()).messages.loadFailed(reason));
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

    clearInterval(auroraTimer);
    auroraTimer = setInterval(() => {
      if (!isHidden()) loadAurora();
    }, AURORA_REFRESH_MS);
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
    onMessage(dict(lang()).hud.loadingWeather);
    await loadWeather();
  }

  function startDemo({ place, atMs, overrides }) {
    state.demoMode = true;
    // В демо Kp приходит из сценария (?kp=7), сеть не трогаем.
    const station = demoStation(place, { atMs, weather: overrides });
    state.place = station.place;
    onPlace(station.place);
    applyStation(station, 'demo');
  }

  async function startLive() {
    const { place } = await resolvePlace(lang());
    state.place = place;

    // До прихода погоды — нейтральный кадр, а не уверенное «ясно».
    const ambient = buildAmbientWorld(place);
    onWorld(ambient, 0);
    onPlace(place);
    onMessage(dict(lang()).hud.loadingWeather);

    const cached = readCache();
    if (cached && samePlace(cached.place, place)) applyStation(cached, 'cache');

    loadAurora();
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
    return buildWorldState(state.station, at, {
      sinceRainMin: sinceRainMin(at),
      lastRainIntensity: state.lastRainIntensity,
      kp: state.kp,
    });
  }

  function dispose() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    clearInterval(auroraTimer);
    auroraTimer = null;
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
