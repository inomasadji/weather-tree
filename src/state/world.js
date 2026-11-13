// Station → WorldState: единственная модель, которую читает рендер.
// Здесь только нормализация и астрономия; фенология листвы и осадки — в M4–M5.

import { describeWeather, isPrecipitation, windCardinal } from '../model/weather.js';
import { dayOfYear, offsetSecondsFor, stationDate } from '../model/clock.js';
import {
  SUNRISE_ALTITUDE,
  daylightPhase,
  moonIllumination,
  moonPhase,
  moonPosition,
  sunPosition,
} from '../model/sun.js';
import { seasonPhase } from '../model/season.js';

/**
 * @param {object} station результат api/openMeteo.js или api/wttr.js
 * @param {number} [atMs] момент, на который строим состояние (для тестов и таймшифта)
 * @returns {object|null}
 */
export function buildWorldState(station, atMs = Date.now()) {
  if (!station || !station.current || !station.place) return null;

  const offset = Number.isFinite(station.utcOffsetSeconds) ? station.utcOffsetSeconds : 0;
  const local = stationDate(offset, atMs);
  const current = station.current;
  const precipitation = isPrecipitation(current.code);

  const { lat, lon } = station.place;
  const hemisphere = lat >= 0 ? 'N' : 'S';
  const sun = sunPosition(atMs, lat, lon);
  const moon = moonPosition(atMs, lat, lon);
  const phase = moonPhase(atMs);

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
      hemisphere,
      /** День/ночь — по астрономии, а не по флагу провайдера. */
      isDay: sun.altitudeDeg > SUNRISE_ALTITUDE,
      daylight: daylightPhase(sun.altitudeDeg),
      season: seasonPhase(dayOfYear(local), hemisphere),
      sun,
      moon: {
        ...moon,
        phase,
        illumination: moonIllumination(phase),
      },
      isPrecip: precipitation,
      /** Осадки при морозе — снег, а не дождь. Порог из docs/WEATHER-MAPPING.md. */
      isFrozen: precipitation && current.tempC <= 1.5,
    },
  };
}

/**
 * Мир до прихода погоды: правильные светила и сезон, чистое небо.
 * Нужен, чтобы сцена жила сразу после выбора точки, а не показывала пустоту.
 * @param {{lat: number, lon: number, name: string, country?: string, timeZone?: string}} place
 * @param {number} [atMs]
 * @returns {object}
 */
export function buildAmbientWorld(place, atMs = Date.now()) {
  const offset = offsetSecondsFor(place.timeZone, atMs);

  return buildWorldState(
    {
      place: { name: place.name, country: place.country ?? '', lat: place.lat, lon: place.lon },
      timezone: place.timeZone ?? 'UTC',
      utcOffsetSeconds: offset,
      observedAt: null,
      fetchedAt: atMs,
      current: {
        tempC: 0,
        feelsC: 0,
        humidity: 0,
        code: 0,
        cloudPct: 0,
        precipMm: 0,
        pressureHpa: 1013,
        windKmh: 0,
        windDirDeg: 0,
        gustKmh: 0,
        isDay: true,
      },
      daily: { sunrise: null, sunset: null, daylightSeconds: null },
    },
    atMs,
  );
}
