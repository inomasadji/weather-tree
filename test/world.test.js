import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorldState } from '../src/state/world.js';

const STATION = {
  place: { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173 },
  timezone: 'Europe/Moscow',
  utcOffsetSeconds: 3 * 3600,
  observedAt: '2026-01-14T19:15',
  fetchedAt: 1_700_000_000_000,
  current: {
    tempC: -10.6,
    feelsC: -19.2,
    humidity: 84,
    code: 75,
    cloudPct: 100,
    precipMm: 1.4,
    pressureHpa: 997,
    windKmh: 28.4,
    windDirDeg: 223,
    gustKmh: 47.1,
    isDay: false,
  },
  daily: { sunrise: '2026-01-14T08:56', sunset: '2026-01-14T16:34', daylightSeconds: 27_480 },
};

test('buildWorldState: местное время, а не UTC', () => {
  // 16:15 UTC = 19:15 в Москве
  const world = buildWorldState(STATION, Date.UTC(2026, 0, 14, 16, 15, 0));
  assert.ok(world);

  assert.equal(world.now.hour, 19);
  assert.equal(world.now.minute, 15);
  assert.equal(world.now.dayOfYear, 14);
  assert.equal(world.now.utcOffsetSeconds, 3 * 3600);
  assert.equal(world.now.timezone, 'Europe/Moscow');
});

test('buildWorldState: зимняя метель помечена как снег', () => {
  const world = buildWorldState(STATION, Date.UTC(2026, 0, 14, 16, 15, 0));

  assert.equal(world.weather.label, 'Сильный снег');
  assert.equal(world.weather.windCardinal, 'ЮЗ');
  assert.equal(world.derived.hemisphere, 'N');
  assert.equal(world.derived.isDay, false);
  assert.equal(world.derived.isPrecip, true);
  assert.equal(world.derived.isFrozen, true);
});

test('buildWorldState: летний день — не осадки и не мороз', () => {
  const summer = {
    ...STATION,
    current: { ...STATION.current, tempC: 24.4, feelsC: 25, code: 0, precipMm: 0, isDay: true },
  };

  const world = buildWorldState(summer, Date.UTC(2026, 6, 9, 9, 0, 0));
  assert.equal(world.weather.label, 'Ясно');
  assert.equal(world.derived.isPrecip, false);
  assert.equal(world.derived.isFrozen, false);
  assert.equal(world.now.hour, 12);
  assert.equal(world.now.dayOfYear, 190);
});

test('buildWorldState: южное полушарие определяется по широте', () => {
  const sydney = {
    ...STATION,
    place: { name: 'Сидней', country: 'Австралия', lat: -33.87, lon: 151.21 },
    utcOffsetSeconds: 11 * 3600,
  };

  const world = buildWorldState(sydney, Date.UTC(2026, 0, 15, 1, 0, 0));
  assert.equal(world.derived.hemisphere, 'S');
  assert.equal(world.now.hour, 12);
});

test('buildWorldState возвращает null без данных', () => {
  assert.equal(buildWorldState(null), null);
  assert.equal(buildWorldState({}), null);
});
