import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { drawFireflies, drawGroundWetness, drawWeather } from '../src/render/weatherFx.js';
import { sceneConditions } from '../src/model/conditions.js';
import { scenePalette } from '../src/model/palette.js';
import { hexColor } from '../src/render/color.js';

const BLACK = hexColor('#000000');

const palette = scenePalette({ altitudeDeg: 25, seasonPhase: 0.5 });
const at = Date.UTC(2026, 6, 9, 12, 0);

/** @param {object} weather */
const conditionsFor = (weather) =>
  sceneConditions({ weather: { code: 0, tempC: 12, humidity: 60, windKmh: 8, ...weather } });

test('мокрый грунт рисует лужи, сухой — нет', () => {
  const wet = new Surface(320, 180);
  wet.clear(BLACK);
  drawGroundWetness(wet, conditionsFor({ code: 63, tempC: 12 }), { palette, timeMs: at });
  assert.ok(wet.pixels.some((pixel) => pixel !== BLACK), 'при дожде земля должна измениться');

  const dry = new Surface(320, 180);
  dry.clear(BLACK);
  drawGroundWetness(dry, conditionsFor({ code: 0 }), { palette, timeMs: at });
  assert.equal(dry.pixels.some((pixel) => pixel !== BLACK), false);
});

test('дождь рисует частицы только при осадках', () => {
  const rainy = new Surface(320, 180);
  rainy.clear(BLACK);
  drawWeather(rainy, conditionsFor({ code: 61, tempC: 10 }), {
    timeMs: at,
    windKmh: 14,
    palette,
  });
  const rainyPixels = rainy.pixels.filter((pixel) => pixel !== BLACK).length;
  assert.ok(rainyPixels > 200, `частиц: ${rainyPixels}`);

  const clear = new Surface(320, 180);
  clear.clear(BLACK);
  drawWeather(clear, conditionsFor({ code: 0 }), { timeMs: at, windKmh: 2, palette });
  assert.equal(clear.pixels.filter((pixel) => pixel !== BLACK).length, 0);
});

test('туман гасит контраст всей сцены', () => {
  const surface = new Surface(320, 180);
  surface.clear(hexColor('#305070'));
  const before = surface.pixels.slice();

  drawWeather(surface, conditionsFor({ code: 45, humidity: 99 }), {
    timeMs: at,
    windKmh: 2,
    palette,
  });

  assert.notDeepEqual(surface.pixels, before);
  assert.ok(surface.pixels.every((pixel) => pixel !== BLACK));
});

test('светлячки: детерминированы, гаснут и выключаются нулевой плотностью', () => {
  const first = new Surface(320, 180);
  const second = new Surface(320, 180);
  first.clear(BLACK);
  second.clear(BLACK);

  const nightPalette = scenePalette({ altitudeDeg: -20, seasonPhase: 0.5 });
  drawFireflies(first, { timeMs: at, palette: nightPalette, horizonY: 100, baseY: 170 });
  drawFireflies(second, { timeMs: at, palette: nightPalette, horizonY: 100, baseY: 170 });

  assert.deepEqual(first.pixels, second.pixels);
  const lit = first.pixels.filter((pixel) => pixel !== BLACK).length;
  assert.ok(lit > 0 && lit <= 20, `светлячков: ${lit}`);

  const off = new Surface(320, 180);
  off.clear(BLACK);
  drawFireflies(off, { timeMs: at, palette: nightPalette, horizonY: 100, baseY: 170, density: 0 });
  assert.equal(off.pixels.filter((pixel) => pixel !== BLACK).length, 0);
});
