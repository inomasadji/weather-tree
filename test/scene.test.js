// Golden-кадр: страховка от случайных изменений пиксельного рантайма.
// Хеш меняется при намеренной правке сцены — тогда обновите константу
// и опишите причину в коммите (см. AGENTS.md).

import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { renderScene, HORIZON } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';
import { scenePalette } from '../src/model/palette.js';
import { SCENARIOS, scenarioWorld, hashOf } from '../tools/snapshot.mjs';

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173, timeZone: 'Europe/Moscow' };

const GOLDEN_HASHES = {
  'm3-july-noon': '5ee153e1c3174f5f',
  'm3-january-night': '10648ec95a29a94c',
  'm5-storm': '3fbe6f172a23e043',
};

const SUMMER_NOON = Date.UTC(2026, 6, 9, 9, 0);
const WINTER_NIGHT = Date.UTC(2026, 0, 14, 16, 15);

/** @param {number} atMs @param {object} weather */
function worldFor(atMs, weather) {
  const station = demoStation(MOSCOW, { atMs, weather });
  return buildWorldState(station, atMs);
}

test('сцена рендерится детерминированно', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const first = new Surface(LOGICAL.width, LOGICAL.height);
  const second = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(first, world, SUMMER_NOON, SUMMER_NOON);
  renderScene(second, world, SUMMER_NOON, SUMMER_NOON);

  assert.deepEqual(first.data, second.data);
});

for (const [name, expected] of Object.entries(GOLDEN_HASHES)) {
  test(`golden-кадр ${name} не изменился`, () => {
    const scenario = SCENARIOS.find((item) => item.name === name);
    assert.ok(scenario, `не найден сценарий ${name}`);

    const { world, atMs } = scenarioWorld(scenario);
    const surface = new Surface(LOGICAL.width, LOGICAL.height);

    renderScene(surface, world, atMs, atMs);
    assert.equal(hashOf(surface), expected);
  });
}

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

test('нейтральный кадр не показывает солнце', () => {
  const station = demoStation(MOSCOW, {
    atMs: SUMMER_NOON,
    weather: { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 },
  });
  const world = buildWorldState(station, SUMMER_NOON);
  world.weather.known = false;

  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface, world, SUMMER_NOON, SUMMER_NOON);

  const palette = scenePalette({
    altitudeDeg: world.derived.sun.altitudeDeg,
    cloudPct: 55,
    seasonPhase: world.derived.season,
    neutral: true,
  });

  let sunPixels = 0;
  for (const pixel of surface.pixels) if (pixel === palette.sunCore) sunPixels += 1;
  assert.equal(sunPixels, 0, 'в нейтральном кадре солнца быть не должно');
});
