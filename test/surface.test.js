import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface, BAYER4, bayerThreshold } from '../src/render/surface.js';
import { hexColor, mixColor, pack, unpack } from '../src/render/color.js';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

test('цвет: упаковка и распаковка каналов', () => {
  assert.deepEqual(unpack(RED), { r: 255, g: 0, b: 0, a: 255 });
  assert.deepEqual(unpack(hexColor('#0a1229')), { r: 10, g: 18, b: 41, a: 255 });
  assert.deepEqual(unpack(hexColor('#abc')), { r: 170, g: 187, b: 204, a: 255 });
  assert.throws(() => hexColor('#12'));
});

test('mixColor идёт от a к b', () => {
  assert.deepEqual(unpack(mixColor(RED, BLUE, 0)), unpack(RED));
  assert.deepEqual(unpack(mixColor(RED, BLUE, 1)), unpack(BLUE));
  const middle = unpack(mixColor(pack(0, 0, 0), pack(200, 100, 40), 0.5));
  assert.deepEqual(middle, { r: 100, g: 50, b: 20, a: 255 });
});

test('пиксель вне буфера игнорируется', () => {
  const surface = new Surface(8, 8);
  surface.clear(RED);

  surface.pixel(-1, 0, BLUE);
  surface.pixel(0, -1, BLUE);
  surface.pixel(8, 0, BLUE);
  surface.pixel(0, 8, BLUE);

  assert.equal(surface.pixels.filter((pixel) => pixel === BLUE).length, 0);
});

test('fillRect отсекается по границам', () => {
  const surface = new Surface(8, 8);
  surface.clear(RED);
  surface.fillRect(-2, -2, 4, 4, BLUE);

  assert.equal(unpack(surface.get(0, 0)).b, 255);
  assert.equal(unpack(surface.get(1, 1)).b, 255);
  assert.equal(unpack(surface.get(2, 2)).b, 0);
  assert.equal(surface.pixels.filter((pixel) => pixel === BLUE).length, 4);
});

test('линия попадает в обе конечные точки', () => {
  const surface = new Surface(10, 10);
  surface.clear(RED);
  surface.line(1, 1, 8, 6, BLUE);

  assert.equal(surface.get(1, 1), BLUE);
  assert.equal(surface.get(8, 6), BLUE);

  let painted = 0;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      if (surface.get(x, y) === BLUE) painted += 1;
    }
  }
  // Линия непрерывна: не меньше, чем ширина по x.
  assert.ok(painted >= 8, `закрашено пикселей: ${painted}`);
});

test('эллипс закрашивает центр и не выходит за радиусы', () => {
  const surface = new Surface(24, 24);
  surface.clear(RED);
  surface.circle(12, 12, 4, BLUE);

  assert.equal(surface.get(12, 12), BLUE);
  assert.equal(surface.get(12, 8), BLUE);
  assert.equal(surface.get(12, 16), BLUE);
  assert.equal(surface.get(8, 12), BLUE);
  assert.equal(surface.get(12, 6), RED);
  assert.equal(surface.get(12, 18), RED);
});

test('дизеринг: верх градиента — чистый цвет, низ — второй', () => {
  const surface = new Surface(8, 8);
  surface.gradientV(0, 0, 8, 8, [
    { at: 0, color: RED },
    { at: 1, color: BLUE },
  ]);

  for (let x = 0; x < 8; x += 1) {
    assert.equal(surface.get(x, 0), RED);
    assert.equal(surface.get(x, 7), BLUE);
  }
});

test('полосы в градиенте ограничивают палитру', () => {
  const surface = new Surface(8, 32);
  surface.gradientV(0, 0, 8, 32, [
    { at: 0, color: RED },
    { at: 1, color: BLUE },
  ], { bands: 4 });

  const colors = new Set();
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 8; x += 1) colors.add(surface.get(x, y));
  }

  // bands=4 → не больше пяти уровней (0, ¼, ½, ¾, 1).
  assert.ok(colors.size <= 5, `уровней: ${colors.size}`);
  assert.ok(colors.has(RED) && colors.has(BLUE));
});

test('матрица Байера: 4×4, пороги в (0,1)', () => {
  assert.equal(BAYER4.length, 4);
  assert.ok(BAYER4.every((row) => row.length === 4));

  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const threshold = bayerThreshold(x, y);
      assert.ok(threshold > 0 && threshold < 1);
    }
  }
});

test('veil смешивает с фоном, сохраняя непрозрачность', () => {
  const surface = new Surface(4, 4);
  surface.clear(pack(0, 0, 0));
  surface.veil(0, 0, 4, 4, pack(255, 255, 255, 128));

  const pixel = unpack(surface.get(2, 2));
  assert.ok(pixel.r > 120 && pixel.r < 136, `ожидали ~128, получили ${pixel.r}`);
  assert.equal(pixel.a, 255);
});

test('noise детерминирован и лежит в 0…1', () => {
  assert.equal(Surface.noise(3, 7, 1), Surface.noise(3, 7, 1));
  assert.notEqual(Surface.noise(3, 7, 1), Surface.noise(3, 7, 2));

  for (let index = 0; index < 50; index += 1) {
    const value = Surface.noise(index, index * 3, 5);
    assert.ok(value >= 0 && value < 1);
  }
});
