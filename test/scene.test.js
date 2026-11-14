// Golden-кадр: страховка от случайных изменений пиксельного рантайма.
// Хеш меняется при намеренной правке сцены — тогда обновите константу
// и опишите причину в коммите (см. AGENTS.md).

import test from 'node:test';
import assert from 'node:assert/strict';

import { Surface } from '../src/render/surface.js';
import { clearSceneCache, renderScene, HORIZON } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';
import { scenePalette } from '../src/model/palette.js';
import {
  SCENARIOS,
  diffSurfaces,
  readGolden,
  renderScenario,
  saveDiff,
} from '../tools/snapshot.mjs';

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173, timeZone: 'Europe/Moscow' };

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

test('эталоны golden-кадров есть для всех сценариев', () => {
  const missing = SCENARIOS.filter((scenario) => !readGolden(scenario.name)).map((scenario) => scenario.name);
  assert.deepEqual(
    missing,
    [],
    `нет эталонов: ${missing.join(', ')} — создайте их командой npm run snapshot -- --update`,
  );
});

for (const scenario of SCENARIOS) {
  test(`golden-кадр ${scenario.name} совпадает с эталоном`, () => {
    const expected = readGolden(scenario.name);
    assert.ok(expected, `нет эталона ${scenario.name} — npm run snapshot -- --update`);

    const actual = renderScenario(scenario);
    const diff = diffSurfaces(actual, expected);
    if (diff.changed > 0) saveDiff(scenario.name, diff.map);

    assert.equal(
      diff.changed,
      0,
      `${scenario.name}: ${diff.changed} из ${diff.total} пикселей ` +
        `(${(diff.ratio * 100).toFixed(2)}%), ` +
        `область x${diff.box?.x0}..${diff.box?.x1} y${diff.box?.y0}..${diff.box?.y1}, ` +
        `карта различий: snapshots/out/diff-${scenario.name}.png`,
    );
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

test('clearSceneCache сбрасывает кэши, не ломая последующий рендер', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const first = new Surface(LOGICAL.width, LOGICAL.height);
  const second = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(first, world, SUMMER_NOON, SUMMER_NOON);
  clearSceneCache();
  renderScene(second, world, SUMMER_NOON, SUMMER_NOON);

  assert.deepEqual(first.data, second.data);
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

test('сцена корректно рендерится в произвольном полноэкранном разрешении', () => {  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 61, cloudPct: 60, windKmh: 18 });

  for (const [width, height] of [[360, 225], [195, 422]]) {
    const surface = new Surface(width, height);
    renderScene(surface, world, SUMMER_NOON, SUMMER_NOON);

    for (let index = 3; index < surface.data.length; index += 4) {
      assert.equal(surface.data[index], 255);
    }
  }
});

test('параллакс камеры сдвигает кадр и остаётся детерминированным', () => {
  const world = worldFor(SUMMER_NOON, { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 });
  const base = new Surface(LOGICAL.width, LOGICAL.height);
  const shifted = new Surface(LOGICAL.width, LOGICAL.height);
  const again = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(base, world, SUMMER_NOON, SUMMER_NOON);
  renderScene(shifted, world, SUMMER_NOON, SUMMER_NOON, { x: 0.8, y: -0.4 });
  renderScene(again, world, SUMMER_NOON, SUMMER_NOON, { x: 0.8, y: -0.4 });

  assert.deepEqual(shifted.data, again.data, 'параллакс детерминирован');
  assert.notDeepEqual(shifted.data, base.data, 'сдвиг камеры должен менять кадр');
});
