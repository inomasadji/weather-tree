import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { hexColor } from '../src/render/color.js';
import { buildTree, drawLeafFall, drawShadow, drawTree, treeSeed } from '../src/render/tree.js';
import { foliageState } from '../src/model/phenology.js';

const BLACK = hexColor('#000000');
const WHITE = hexColor('#ffffff');
const GROUND = hexColor('#3a5a3a');

test('treeSeed детерминирован и различается между городами', () => {
  assert.equal(treeSeed(55.7558, 37.6173), treeSeed(55.7558, 37.6173));
  assert.notEqual(treeSeed(55.7558, 37.6173), treeSeed(-33.8688, 151.2093));
});

test('buildTree строит детерминированный скелет и кластеры кроны', () => {
  const seed = treeSeed(55.7558, 37.6173);
  const first = buildTree(seed);
  const second = buildTree(seed);

  assert.deepEqual(first, second);
  assert.ok(first.segments.length > 20);
  assert.ok(first.clusters.length > 10);
  assert.equal(first.baseX, 80);
  assert.equal(first.baseY, 179);
});

test('drawShadow рисует тень только днём и с противоположной от солнца стороны', () => {
  const tree = buildTree(treeSeed(55.7558, 37.6173));

  const night = new Surface(320, 180);
  night.clear(GROUND);
  drawShadow(night, tree, {
    sunAltitudeDeg: -5,
    sunScreenX: 40,
    light: 0.5,
    groundColor: GROUND,
  });
  assert.equal(night.pixels.every((pixel) => pixel === GROUND), true);

  const morning = new Surface(320, 180);
  morning.clear(GROUND);
  drawShadow(morning, tree, {
    sunAltitudeDeg: 25,
    sunScreenX: 30,
    light: 1,
    groundColor: GROUND,
  });

  // Солнце слева (x=30) → тень падает вправо от ствола (x > baseX).
  let leftShadow = 0;
  let rightShadow = 0;
  for (let y = tree.baseY - 12; y <= tree.baseY; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      if (morning.get(x, y) === GROUND) continue;
      if (x < tree.baseX) leftShadow += 1;
      else if (x > tree.baseX) rightShadow += 1;
    }
  }
  assert.ok(rightShadow > leftShadow * 2, `left=${leftShadow}, right=${rightShadow}`);
});

test('drawTree рисует летом больше пикселей кроны, чем зимой', () => {
  const tree = buildTree(treeSeed(55.7558, 37.6173));

  const winterSurface = new Surface(320, 180);
  winterSurface.clear(BLACK);
  drawTree(winterSurface, tree, {
    foliage: foliageState(0.05, { tempC: -10, windKmh: 4 }),
    timeMs: 0,
    windAmp: 0,
    windDirDeg: 0,
    light: 1,
    snowLoad: 0,
    snowColor: WHITE,
    wetness: 0,
  });

  const summerSurface = new Surface(320, 180);
  summerSurface.clear(BLACK);
  drawTree(summerSurface, tree, {
    foliage: foliageState(0.5, { tempC: 24, windKmh: 4 }),
    timeMs: 0,
    windAmp: 0,
    windDirDeg: 0,
    light: 1,
    snowLoad: 0,
    snowColor: WHITE,
    wetness: 0,
  });

  const winterPixels = winterSurface.pixels.filter((pixel) => pixel !== BLACK).length;
  const summerPixels = summerSurface.pixels.filter((pixel) => pixel !== BLACK).length;

  assert.ok(winterPixels > 300);
  assert.ok(summerPixels > winterPixels * 2, `winter=${winterPixels}, summer=${summerPixels}`);
});

test('drawLeafFall рисует опад осенью и молчит без опада и ветра', () => {
  const tree = buildTree(treeSeed(55.7558, 37.6173));

  const autumn = new Surface(320, 180);
  autumn.clear(BLACK);
  drawLeafFall(autumn, tree, {
    foliage: foliageState(0.88, { tempC: 6, windKmh: 28 }),
    windKmh: 28,
    timeMs: 12_345,
    light: 1,
  });
  assert.ok(autumn.pixels.some((pixel) => pixel !== BLACK));

  const calmSummer = new Surface(320, 180);
  calmSummer.clear(BLACK);
  drawLeafFall(calmSummer, tree, {
    foliage: foliageState(0.5, { tempC: 22, windKmh: 4 }),
    windKmh: 4,
    timeMs: 12_345,
    light: 1,
  });
  assert.equal(calmSummer.pixels.some((pixel) => pixel !== BLACK), false);
});
