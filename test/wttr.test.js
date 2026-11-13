import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWttrUrl,
  computeIsDay,
  localIso,
  mapWwoCode,
  normalizeWttr,
} from '../src/api/wttr.js';

const PLACE = { name: 'Елабуга', country: 'Россия', lat: 55.759, lon: 52.073, timeZone: 'Europe/Moscow' };

// Реальный ответ wttr.in (j1), сокращённый до нужных полей.
const RESPONSE = {
  current_condition: [{
    temp_C: '2',
    FeelsLikeC: '-0',
    humidity: '96',
    cloudcover: '100',
    precipMM: '0.0',
    pressure: '1019',
    windspeedKmph: '6',
    winddirDegree: '169',
    weatherCode: '143',
    observation_time: '04:28 PM',
  }],
  nearest_area: [{
    areaName: [{ value: 'Елабуга' }],
    country: [{ value: 'Russia' }],
    latitude: '55.759',
    longitude: '52.073',
  }],
  weather: [{
    date: '2026-11-13',
    astronomy: [{ sunrise: '07:03 AM', sunset: '03:29 PM' }],
  }],
};

const AT_MS = Date.UTC(2026, 10, 13, 17, 15); // 20:15 по Москве

test('mapWwoCode переводит коды WWO в WMO', () => {
  assert.equal(mapWwoCode(113), 0);
  assert.equal(mapWwoCode('143'), 45);
  assert.equal(mapWwoCode(338), 75);
  assert.equal(mapWwoCode(389), 95);
  assert.equal(mapWwoCode(9999), -1);
});

test('buildWttrUrl использует координаты, а не название', () => {
  assert.equal(buildWttrUrl(PLACE), 'https://wttr.in/55.7590,52.0730?format=j1');
});

test('localIso переводит 12-часовой формат', () => {
  assert.equal(localIso('2026-11-13', '07:03 AM'), '2026-11-13T07:03');
  assert.equal(localIso('2026-11-13', '03:29 PM'), '2026-11-13T15:29');
  assert.equal(localIso('2026-11-13', '12:00 AM'), '2026-11-13T00:00');
  assert.equal(localIso('2026-11-13', '12:30 PM'), '2026-11-13T12:30');
  assert.equal(localIso(null, '07:03 AM'), null);
  assert.equal(localIso('2026-11-13', 'рассвет'), null);
});

test('computeIsDay: до восхода — ночь, в полдень — день', () => {
  const sunrise = '2026-11-13T07:03';
  const sunset = '2026-11-13T15:29';

  assert.equal(computeIsDay(3 * 3600, AT_MS, sunrise, sunset), false);
  const noon = Date.UTC(2026, 10, 13, 9, 0); // 12:00 МСК
  assert.equal(computeIsDay(3 * 3600, noon, sunrise, sunset), true);
});

test('computeIsDay без восхода/заката — грубая эвристика 6–18', () => {
  assert.equal(computeIsDay(3 * 3600, Date.UTC(2026, 10, 13, 9, 0), null, null), true);
  assert.equal(computeIsDay(3 * 3600, Date.UTC(2026, 10, 13, 17, 0), null, null), false);
});

test('normalizeWttr приводит ответ к Station', () => {
  const station = normalizeWttr(RESPONSE, PLACE, AT_MS);

  assert.ok(station);
  assert.equal(station.provider, 'wttr.in');
  assert.equal(station.timezone, 'Europe/Moscow');
  assert.equal(station.utcOffsetSeconds, 3 * 3600);

  assert.equal(station.current.tempC, 2);
  assert.equal(station.current.code, 45);
  assert.equal(station.current.humidity, 96);
  assert.equal(station.current.windKmh, 6);
  assert.equal(station.current.windDirDeg, 169);
  assert.equal(station.current.isDay, false);

  assert.equal(station.daily.sunrise, '2026-11-13T07:03');
  assert.equal(station.daily.sunset, '2026-11-13T15:29');
  assert.equal(station.daily.daylightSeconds, 8 * 3600 + 26 * 60);
});

test('normalizeWttr возвращает null на мусоре', () => {
  assert.equal(normalizeWttr({}, PLACE), null);
  assert.equal(normalizeWttr({ current_condition: [{ temp_C: 'n/a' }] }, PLACE), null);
});
