// Station → WorldState: единственная модель, которую читает рендер.
// Здесь только нормализация; физика (сезон, светила, осадки) — в model/* на M3–M5.

import { describeWeather, isPrecipitation, windCardinal } from '../model/weather.js';
import { dayOfYear, stationDate } from '../model/clock.js';

/**
 * @param {object} station результат api/openMeteo.js
 * @param {number} [atMs] момент, на который строим состояние (для тестов и таймшифта)
 * @returns {object|null}
 */
export function buildWorldState(station, atMs = Date.now()) {
  if (!station || !station.current) return null;

  const offset = Number.isFinite(station.utcOffsetSeconds) ? station.utcOffsetSeconds : 0;
  const local = stationDate(offset, atMs);
  const current = station.current;
  const precipitation = isPrecipitation(current.code);

  return {
    now: {
      epochMs: atMs,
      utcOffsetSeconds: offset,
      timezone: station.timezone,
      dayOfYear: dayOfYear(local),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      second: local.getUTCSeconds(),
    },
    place: station.place,
    weather: {
      code: current.code,
      label: describeWeather(current.code, current.tempC),
      tempC: current.tempC,
      feelsC: current.feelsC,
      humidity: current.humidity,
      cloudPct: current.cloudPct,
      precipMm: current.precipMm,
      pressureHpa: current.pressureHpa,
      windKmh: current.windKmh,
      gustKmh: current.gustKmh,
      windDirDeg: current.windDirDeg,
      windCardinal: windCardinal(current.windDirDeg),
    },
    daily: station.daily ?? { sunrise: null, sunset: null, daylightSeconds: null },
    derived: {
      hemisphere: station.place.lat >= 0 ? 'N' : 'S',
      isDay: Boolean(current.isDay),
      isPrecip: precipitation,
      /** Осадки при морозе — снег, а не дождь. Порог из docs/WEATHER-MAPPING.md. */
      isFrozen: precipitation && current.tempC <= 1.5,
    },
  };
}
