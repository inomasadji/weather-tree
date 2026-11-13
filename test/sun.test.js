import test from 'node:test';
import assert from 'node:assert/strict';

import {
  daylightPhase,
  moonIllumination,
  moonPhase,
  moonPosition,
  sunPosition,
  sunriseSunset,
} from '../src/model/sun.js';

const MOSCOW = { lat: 55.7558, lon: 37.6173 };
const MURMANSK = { lat: 68.9585, lon: 33.0827 };
const MSK = 3 * 3600;

test('солнце в летний полдень высоко и на юге', () => {
  const sun = sunPosition(Date.UTC(2026, 5, 21, 9, 30), MOSCOW.lat, MOSCOW.lon);

  assert.ok(sun.altitudeDeg > 54 && sun.altitudeDeg < 60, `высота ${sun.altitudeDeg}`);
  assert.ok(Math.abs(sun.azimuthDeg - 180) < 15, `азимут ${sun.azimuthDeg}`);
});

test('зимний полдень намного ниже летнего', () => {
  const winter = sunPosition(Date.UTC(2025, 11, 21, 9, 30), MOSCOW.lat, MOSCOW.lon);
  const summer = sunPosition(Date.UTC(2026, 5, 21, 9, 30), MOSCOW.lat, MOSCOW.lon);

  assert.ok(winter.altitudeDeg > 8 && winter.altitudeDeg < 15, `высота ${winter.altitudeDeg}`);
  assert.ok(summer.altitudeDeg - winter.altitudeDeg > 40);
});

test('утром солнце на востоке, вечером — на западе', () => {
  const morning = sunPosition(Date.UTC(2026, 3, 1, 4, 0), MOSCOW.lat, MOSCOW.lon);
  const evening = sunPosition(Date.UTC(2026, 3, 1, 15, 0), MOSCOW.lat, MOSCOW.lon);

  assert.ok(morning.azimuthDeg < 120, `азимут утром ${morning.azimuthDeg}`);
  assert.ok(evening.azimuthDeg > 240, `азимут вечером ${evening.azimuthDeg}`);
});

test('Мурманск в декабре — полярная ночь', () => {
  const noon = Date.UTC(2026, 11, 21, 9, 0);
  const sun = sunPosition(noon, MURMANSK.lat, MURMANSK.lon);

  assert.ok(sun.altitudeDeg < 0, `высота ${sun.altitudeDeg}`);

  const times = sunriseSunset(noon, MURMANSK.lat, MURMANSK.lon, MSK);
  assert.equal(times.polar, 'night');
  assert.equal(times.sunrise, null);
});

test('Мурманск в июне — полярный день', () => {
  const noon = Date.UTC(2026, 5, 21, 9, 0);
  const sun = sunPosition(noon, MURMANSK.lat, MURMANSK.lon);
  assert.ok(sun.altitudeDeg > 30);

  const times = sunriseSunset(noon, MURMANSK.lat, MURMANSK.lon, MSK);
  assert.equal(times.polar, 'day');
});

test('длина дня в Москве на солнцестоянии правдоподобна', () => {
  const times = sunriseSunset(Date.UTC(2026, 5, 21, 9, 0), MOSCOW.lat, MOSCOW.lon, MSK);

  assert.ok(times.sunrise !== null && times.sunset !== null);
  assert.ok(times.daylightSeconds > 17 * 3600, `день ${times.daylightSeconds / 3600} ч`);
  assert.ok(times.daylightSeconds < 18.5 * 3600, `день ${times.daylightSeconds / 3600} ч`);
});

test('фаза суток по высоте солнца', () => {
  assert.equal(daylightPhase(25), 'day');
  assert.equal(daylightPhase(2), 'golden');
  assert.equal(daylightPhase(-0.5), 'golden');
  assert.equal(daylightPhase(-3), 'civil');
  assert.equal(daylightPhase(-9), 'nautical');
  assert.equal(daylightPhase(-15), 'astro');
  assert.equal(daylightPhase(-30), 'night');
});

test('фаза луны: цикл 29.5 суток', () => {
  const epoch = Date.UTC(2000, 0, 6, 18, 14);

  assert.ok(moonPhase(epoch) < 0.001 || moonPhase(epoch) > 0.999);
  const half = epoch + 14.765 * 86_400_000;
  assert.ok(Math.abs(moonPhase(half) - 0.5) < 0.01);
});

test('освещённость луны от новолуния к полнолунию', () => {
  assert.ok(moonIllumination(0) < 0.001);
  assert.ok(moonIllumination(0.5) > 0.999);
  assert.ok(Math.abs(moonIllumination(0.25) - 0.5) < 0.01);
});

test('положение луны считается и лежит в допустимых пределах', () => {
  const moon = moonPosition(Date.UTC(2026, 0, 14, 16, 15), MOSCOW.lat, MOSCOW.lon);

  assert.ok(Number.isFinite(moon.altitudeDeg));
  assert.ok(moon.altitudeDeg >= -90 && moon.altitudeDeg <= 90);
  assert.ok(moon.azimuthDeg >= 0 && moon.azimuthDeg < 360);
  assert.ok(moon.hourAngleDeg >= -180 && moon.hourAngleDeg <= 180);
});
