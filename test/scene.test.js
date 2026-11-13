// Golden-кадр: страховка от случайных изменений пиксельного рантайма.
// Хеш меняется при намеренной правке сцены — тогда обновите константу
// и опишите причину в коммите (см. AGENTS.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Surface } from '../src/render/surface.js';
import { renderScene, HORIZON } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';
import { scenePalette } from '../src/model/palette.js';

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173, timeZone: 'Europe/Moscow' };

const EXPECTED_HASH = 'fff8a9cc57ce99d8';

const SUMMER_NOON = Date.UTC(2026, 6, 9, 9, 0);
const WINTER_NIGHT = Date.UTC(2026, 0, 14, 16, 15);

/** @param {number} atMs @param {object} weather */
function worldFor(atMs, weather) {
  const station = demoStation(MOSCOW, { atMs, weather });
  return buildWorldState(station, atMs);
}

const hashOf = (surface) =>
  createHash('sha256').update(surface.data).digest('hex').slice(0, 16);

test('сцена рендерится детерминированно', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const first = new Surface(LOGICAL.width, LOGICAL.height);
  const second = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(first, world, SUMMER_NOON, SUMMER_NOON);
  renderScene(second, world, SUMMER_NOON, SUMMER_NOON);

  assert.deepEqual(first.data, second.data);
});

test('golden-кадр летнего полдня не изменился', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const surface = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(surface, world, SUMMER_NOON, SUMMER_NOON);
  assert.equal(hashOf(surface), EXPECTED_HASH);
});

test('без мира буфер остаётся нетронутым', () => {
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface, null);

  assert.equal(surface.pixels.some((pixel) => pixel !== 0), false);
});

test('сцена заполняет весь буфер и альфа непрозрачная', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface, world, SUMMER_NOON, SUMMER_NOON);

  for (let index = 3; index < surface.data.length; index += 4) {
    assert.equal(surface.data[index], 255);
  }
});

test('ночью на ясном небе есть звёзды', () => {
  const world = worldFor(WINTER_NIGHT, { tempC: -11, code: 0, cloudPct: 0, windKmh: 4 });
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface, world, WINTER_NIGHT, WINTER_NIGHT);

  const palette = scenePalette({
    altitudeDeg: world.derived.sun.altitudeDeg,
    cloudPct: 0,
    seasonPhase: world.derived.season,
  });

  let stars = 0;
  for (let y = 0; y < HORIZON; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (surface.get(x, y) === palette.star) stars += 1;
    }
  }

  assert.ok(stars > 10, `звёздных пикселей: ${stars}`);
});

test('горизонт внутри буфера', () => {
  assert.ok(HORIZON > 0 && HORIZON < LOGICAL.height);
});
