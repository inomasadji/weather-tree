import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLang } from '../src/model/i18n.js';
import { describeWeather, formatWind, windCardinal } from '../src/model/weather.js';
import { formatDate, formatRelative } from '../src/model/clock.js';
import { describeScene } from '../src/model/describe.js';
import { humanReason } from '../src/state/controller.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';

const MOSCOW = { name: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62, timeZone: 'Europe/Moscow' };

test('normalizeLang выбирает ru или en', () => {
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('en-US'), 'en');
  assert.equal(normalizeLang('ru'), 'ru');
  assert.equal(normalizeLang(null), 'ru');
  assert.equal(normalizeLang('de'), 'ru');
});

test('погода, ветер и время форматируются по-английски при lang="en"', () => {
  assert.equal(describeWeather(0, 20, 'en'), 'Clear sky');
  assert.equal(describeWeather(61, -3, 'en'), 'Light sleet');
  assert.equal(windCardinal(225, 'en'), 'SW');
  assert.equal(formatWind(18, 225, 'en'), '18 km/h SW');
  assert.equal(formatRelative(0, 180_000, 'en'), '3m ago');
  assert.match(formatDate(new Date(Date.UTC(2026, 6, 9)), 'en'), /July/);
  assert.match(humanReason('timeout', 'en'), /timed out/);
});

test('describeScene строит описание на английском при lang="en"', () => {
  const atMs = Date.UTC(2026, 6, 9, 9, 0);
  const world = buildWorldState(demoStation(MOSCOW, { atMs, weather: { code: 0, tempC: 24, windKmh: 4 } }), atMs);
  const text = describeScene(world, 'en');

  assert.match(text, /^Pixel scene:/);
  assert.match(text, /clear sky/);
  assert.match(text, /leafy tree/);
});
