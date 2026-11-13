// Отладочная погода для офлайна и скриншотов: `?demo=1`.
// Это не «фейковые данные вместо реальных»: включается только явным параметром
// и всегда помечается в HUD как «демо».

import { FALLBACK_PLACE } from '../config.js';

/**
 * @param {object} [place]
 * @returns {object} Station того же формата, что отдаёт api/openMeteo.js
 */
export function demoStation(place = FALLBACK_PLACE) {
  return {
    place: {
      name: place.name,
      country: place.country ?? '',
      lat: place.lat,
      lon: place.lon,
    },
    timezone: 'Europe/Moscow',
    utcOffsetSeconds: 3 * 3600,
    observedAt: null,
    fetchedAt: Date.now(),
    current: {
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
    },
    daily: { sunrise: null, sunset: null, daylightSeconds: null },
  };
}
