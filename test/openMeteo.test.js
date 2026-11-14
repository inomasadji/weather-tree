import test from 'node:test';
import assert from 'node:assert/strict';

import { buildForecastUrl, normalizeStation } from '../src/api/openMeteo.js';

const PLACE = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173 };

// Форма ответа Open-Meteo /v1/forecast с current + daily (см. docs.open-meteo.com).
const RESPONSE = {
  latitude: 55.75,
  longitude: 37.62,
  generationtime_ms: 0.06,
  utc_offset_seconds: 10800,
  timezone: 'Europe/Moscow',
  timezone_abbreviation: 'MSK',
  elevation: 155,
  current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
  current: {
    time: '2026-01-14T19:15',
    interval: 900,
    temperature_2m: -10.6,
    apparent_temperature: -19.2,
    relative_humidity_2m: 84,
    weather_code: 75,
    cloud_cover: 100,
    precipitation: 1.4,
    surface_pressure: 997.3,
    wind_speed_10m: 28.4,
    wind_direction_10m: 223,
    wind_gusts_10m: 47.1,
    is_day: 0,
  },
  daily_units: { sunrise: 'iso8601' },
  daily: {
    time: ['2026-01-14'],
    sunrise: ['2026-01-14T08:56'],
    sunset: ['2026-01-14T16:34'],
    daylight_duration: [27_480.5],
  },
};

test('buildForecastUrl запрашивает нужные поля и таймзону авто', () => {
  const url = new URL(buildForecastUrl(PLACE));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '55.76');
  assert.equal(url.searchParams.get('longitude'), '37.62');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
  assert.match(url.searchParams.get('current'), /weather_code/);
  assert.match(url.searchParams.get('current'), /wind_gusts_10m/);
  assert.match(url.searchParams.get('daily'), /sunrise/);
});

test('normalizeStation разворачивает ответ в плоский Station', () => {
  const station = normalizeStation(RESPONSE, PLACE, 1_700_000_000_000);

  assert.ok(station);
  assert.equal(station.timezone, 'Europe/Moscow');
  assert.equal(station.utcOffsetSeconds, 10800);
  assert.equal(station.observedAt, '2026-01-14T19:15');
  assert.equal(station.fetchedAt, 1_700_000_000_000);

  assert.equal(station.current.tempC, -10.6);
  assert.equal(station.current.feelsC, -19.2);
  assert.equal(station.current.code, 75);
  assert.equal(station.current.isDay, false);
  assert.equal(station.current.gustKmh, 47.1);
  assert.equal(station.current.pressureHpa, 997);

  assert.equal(station.daily.sunrise, '2026-01-14T08:56');
  assert.equal(station.daily.sunset, '2026-01-14T16:34');
});

test('normalizeStation переживает отсутствующие необязательные поля', () => {
  const minimal = {
    utc_offset_seconds: 0,
    timezone: 'GMT',
    current: { time: '2026-07-09T12:00', temperature_2m: 24.4 },
  };

  const station = normalizeStation(minimal, PLACE);
  assert.ok(station);
  assert.equal(station.current.tempC, 24.4);
  assert.equal(station.current.feelsC, 24.4, 'feels like падает обратно к температуре');
  assert.equal(station.current.gustKmh, 0);
  assert.equal(station.daily.sunrise, null);
});

test('normalizeStation возвращает null без текущей температуры', () => {
  assert.equal(normalizeStation({}, PLACE), null);
  assert.equal(normalizeStation({ current: {} }, PLACE), null);
});
