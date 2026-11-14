import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { drawNearForeground, paintLandscape } from '../src/render/landscape.js';
import { scenePalette } from '../src/model/palette.js';
import { foliageState } from '../src/model/phenology.js';

const palette = scenePalette({ altitudeDeg: 35, seasonPhase: 0.5 });
const foliage = foliageState(0.5, { tempC: 22, windKmh: 5, species: 'oak' });

test('paintLandscape оставляет небо выше холмов прозрачным и заполняет землю', () => {
  const surface = new Surface(320, 180);
  const bounds = paintLandscape(surface, {
    palette,
    snowCover: 0,
    horizonY: 118,
    baseX: 80,
    seed: 1736741,
    lat: 55.76,
    foliage,
    sunDir: 1,
  });

  assert.ok(bounds.minY < 118 && bounds.maxGroundY >= 118);
  for (let y = 0; y < bounds.minY; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      assert.equal(surface.get(x, y), 0);
    }
  }
  for (let y = bounds.maxGroundY; y < 180; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      assert.notEqual(surface.get(x, y), 0);
    }
  }
});

test('paintLandscape учитывает сторону солнца (светотень холмов и теней)', () => {
  const eastSun = new Surface(320, 180);
  const westSun = new Surface(320, 180);

  const opts = { palette, snowCover: 0, horizonY: 118, baseX: 80, seed: 1736741, lat: 55.76, foliage };
  paintLandscape(eastSun, { ...opts, sunDir: -1 });
  paintLandscape(westSun, { ...opts, sunDir: 1 });

  assert.notDeepEqual(eastSun.pixels, westSun.pixels);
});

test('ближний план: детерминирован, живёт у кромки и качается от ветра', () => {
  const still = new Surface(320, 180);
  const again = new Surface(320, 180);
  const windy = new Surface(320, 180);
  for (const surface of [still, again, windy]) surface.clear(0);

  const opts = { palette, timeMs: 1_000, seed: 1736741, baseX: 80 };
  drawNearForeground(still, { ...opts, windAmp: 0.4 });
  drawNearForeground(again, { ...opts, windAmp: 0.4 });
  drawNearForeground(windy, { ...opts, timeMs: 1_900, windAmp: 0.4 });

  assert.deepEqual(still.pixels, again.pixels, 'кадр детерминирован');
  assert.notDeepEqual(still.pixels, windy.pixels, 'трава должна качаться');

  for (let y = 0; y < 150; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      assert.equal(still.get(x, y), 0, `ближний план не должен залезать в кадр: (${x},${y})`);
    }
  }

  const filled = still.pixels.filter((pixel) => pixel !== 0).length;
  assert.ok(filled > 200, `пикселей ближнего плана: ${filled}`);
});
