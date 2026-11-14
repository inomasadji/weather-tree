import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { birdFlockAt, drawBirds } from '../src/render/birds.js';
import { scenePalette } from '../src/model/palette.js';

const PERIOD = 64_000;
const palette = scenePalette({ altitudeDeg: 25, seasonPhase: 0.5 });

/** Находит момент, когда стая реально в кадре. */
function findFlockTime() {
  for (let slot = 0; slot < 200; slot += 1) {
    const at = slot * PERIOD + 6_000;
    if (birdFlockAt(at, 320)) return at;
  }
  throw new Error('стая не нашлась ни в одном слоте');
}

test('стая — редкость, а не фон: часть слотов пустая', () => {
  let flocks = 0;
  for (let slot = 0; slot < 60; slot += 1) {
    if (birdFlockAt(slot * PERIOD + 3_000, 320)) flocks += 1;
  }
  assert.ok(flocks > 4, `стай слишком мало: ${flocks}`);
  assert.ok(flocks < 45, `стая появляется слишком часто: ${flocks}`);
});

test('стая не висит в кадре весь слот', () => {
  const at = findFlockTime();
  assert.ok(birdFlockAt(at, 320), 'в середине перелёта стая должна быть');
  assert.equal(birdFlockAt(at + 30_000, 320), null, 'после перелёта — пусто');
});

test('стая летит через кадр в одном направлении', () => {
  const at = findFlockTime();
  const start = birdFlockAt(at, 320);
  const end = birdFlockAt(at + 8_000, 320);

  assert.ok(start && end);
  assert.equal(start.dir, end.dir);
  assert.ok(Math.abs(end.x - start.x) > 20, 'стая должна смещаться по кадру');
});

test('drawBirds: детерминирован, рисует силуэты и молчит вне перелёта', () => {
  const at = findFlockTime();
  const first = new Surface(320, 180);
  const second = new Surface(320, 180);
  first.clear(0);
  second.clear(0);

  drawBirds(first, { timeMs: at, palette });
  drawBirds(second, { timeMs: at, palette });

  assert.deepEqual(first.pixels, second.pixels);
  const lit = first.pixels.filter((pixel) => pixel !== 0).length;
  assert.ok(lit >= 9 && lit <= 40, `пикселей птиц: ${lit}`);

  const quiet = new Surface(320, 180);
  quiet.clear(0);
  drawBirds(quiet, { timeMs: at + 30_000, palette });
  assert.equal(quiet.pixels.filter((pixel) => pixel !== 0).length, 0);
});
