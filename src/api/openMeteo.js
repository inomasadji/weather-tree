// Клиент Open-Meteo: текущая погода + восход/закат.
// Ключ не нужен, CORS открыт — потому и выбран этот провайдер.

import { WEATHER } from '../config.js';
import { fetchJson } from './http.js';

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'cloud_cover',
  'precipitation',
  'rain',
  'snowfall',
  'snow_depth',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'is_day',
];

const DAILY_FIELDS = ['sunrise', 'sunset', 'daylight_duration'];

/**
 * @param {{lat: number, lon: number}} place
 * @returns {string}
 */
export function buildForecastUrl(place) {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: CURRENT_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    timezone: 'auto',
    forecast_days: '1',
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
  });
  return `${WEATHER.forecastUrl}?${params}`;
}

/**
 * Приводит сырой ответ API к плоскому Station — единственному формату,
 * с которым работают остальные слои.
 */
export function normalizeStation(json, place, fetchedAt = Date.now()) {
  const current = json && json.current;
  if (!current || typeof current.temperature_2m !== 'number') return null;

  const daily = json.daily || {};
  const num = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

  return {
    place: {
      name: place.name,
      country: place.country || '',
      lat: num(place.lat),
      lon: num(place.lon),
    },
    timezone: json.timezone || 'UTC',
    utcOffsetSeconds: num(json.utc_offset_seconds),
    /** Локальное время наблюдения по версии API, без смещения. */
    observedAt: current.time || null,
    fetchedAt,
    current: {
      tempC: num(current.temperature_2m),
      feelsC: num(current.apparent_temperature, current.temperature_2m),
      humidity: num(current.relative_humidity_2m),
      code: num(current.weather_code, -1),
      cloudPct: num(current.cloud_cover),
      precipMm: num(current.precipitation),
      /** Высота снега, метры. undefined, если провайдер не отдаёт. */
      snowDepthM: Number.isFinite(current.snow_depth) ? current.snow_depth : undefined,
      /** Свежий снег за интервал, см. */
      snowfallCm: Number.isFinite(current.snowfall) ? current.snowfall : undefined,
      pressureHpa: Math.round(num(current.surface_pressure, 1013)),
      windKmh: num(current.wind_speed_10m),
      windDirDeg: num(current.wind_direction_10m),
      gustKmh: num(current.wind_gusts_10m, num(current.wind_speed_10m)),
      isDay: current.is_day === 1,
    },
    daily: {
      sunrise: daily.sunrise?.[0] ?? null,
      sunset: daily.sunset?.[0] ?? null,
      daylightSeconds: daily.daylight_duration?.[0] ?? null,
    },
  };
}

/**
 * @param {{lat: number, lon: number, name: string, country?: string}} place
 * @returns {Promise<{ok: true, station: object} | {ok: false, reason: string}>}
 */
export async function fetchStation(place) {
  const result = await fetchJson(buildForecastUrl(place), {
    timeoutMs: WEATHER.timeoutMs,
    retries: WEATHER.retries,
  });

  if (!result.ok) return result;

  const station = normalizeStation(result.data, place);
  if (!station) return { ok: false, reason: 'shape' };

  return { ok: true, station };
}
