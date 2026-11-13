// Отладочная погода для офлайна и скриншотов: `?demo=1`.
// Это не «фейковые данные вместо реальных»: включается только явным параметром
// и всегда помечается в HUD как «демо».

import { FALLBACK_PLACE } from '../config.js';
import { offsetSecondsFor } from '../model/clock.js';

const DEFAULT_WEATHER = {
  tempC: 24.4,
  feelsC: 25.1,
  humidity: 42,
  code: 0,
  cloudPct: 5,
  precipMm: 0,
  pressureHpa: 1012,
  windKmh: 4,
  windDirDeg: 180,
  gustKmh: 7,
  isDay: true,
};

/**
 * @param {object} [place]
 * @param {{atMs?: number, weather?: object}} [options]
 * @returns {object} Station того же формата, что отдаёт api/openMeteo.js
 */
export function demoStation(place = FALLBACK_PLACE, { atMs = Date.now(), weather = {} } = {}) {
  return {
    place: {
      name: place.name,
      country: place.country ?? '',
      lat: place.lat,
      lon: place.lon,
    },
    timezone: place.timeZone ?? 'Europe/Moscow',
    utcOffsetSeconds: offsetSecondsFor(place.timeZone ?? 'Europe/Moscow', atMs),
    observedAt: null,
    fetchedAt: atMs,
    current: { ...DEFAULT_WEATHER, ...weather },
    daily: { sunrise: null, sunset: null, daylightSeconds: null },
  };
}
