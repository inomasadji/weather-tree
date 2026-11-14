import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { paintLandscape } from '../src/render/landscape.js';
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
