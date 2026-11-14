import test from 'node:test';
import assert from 'node:assert/strict';

import { altitudePalette, scenePalette, shade, skyToneAt } from '../src/model/palette.js';
import { hexColor, unpack } from '../src/render/color.js';

test('палитра дня и ночи различаются', () => {
  const day = scenePalette({ altitudeDeg: 30 });
  const night = scenePalette({ altitudeDeg: -30 });

  assert.equal(day.key, 'day');
  assert.equal(night.key, 'night');
  assert.notDeepEqual(day.sky, night.sky);
});

test('звёзды видны только в темноте', () => {
  assert.equal(scenePalette({ altitudeDeg: 30 }).starOpacity, 0);
  assert.ok(scenePalette({ altitudeDeg: -30 }).starOpacity > 0.9);
  assert.ok(scenePalette({ altitudeDeg: -10 }).starOpacity > 0.1);
});

test('облачность гасит звёзды', () => {
  const clear = scenePalette({ altitudeDeg: -30, cloudPct: 0 });
  const overcast = scenePalette({ altitudeDeg: -30, cloudPct: 95 });

  assert.ok(overcast.starOpacity < clear.starOpacity * 0.3);
});

test('палитра меняется непрерывно по высоте солнца', () => {
  const below = altitudePalette(-9.01);
  const above = altitudePalette(-8.99);

  assert.equal(below.sky.length, above.sky.length);
  for (let index = 0; index < below.sky.length; index += 1) {
    const a = unpack(below.sky[index]);
    const b = unpack(above.sky[index]);
    assert.ok(Math.abs(a.r - b.r) <= 2, `канал R: ${a.r} vs ${b.r}`);
    assert.ok(Math.abs(a.g - b.g) <= 2);
    assert.ok(Math.abs(a.b - b.b) <= 2);
  }
});

test('shade: свет 1 не меняет цвет, свет 0 уводит в сумрак', () => {
  const color = hexColor('#c9d6de');
  assert.equal(shade(color, 1), color);
  assert.notEqual(shade(color, 0), color);

  const dark = unpack(shade(color, 0));
  const light = unpack(color);
  assert.ok(dark.r < light.r && dark.b < light.b);
});

test('зимой земля светлее (снег), летом темнее', () => {
  const winter = scenePalette({ altitudeDeg: 30, seasonPhase: 0 });
  const summer = scenePalette({ altitudeDeg: 30, seasonPhase: 0.5 });

  const brightness = (color) => {
    const { r, g, b } = unpack(color);
    return r + g + b;
  };

  assert.ok(brightness(winter.land.ground) > brightness(summer.land.ground));
});

test('skyToneAt интерполирует стопы', () => {
  const sky = [hexColor('#000000'), hexColor('#ffffff')];

  assert.equal(skyToneAt(sky, 0), sky[0]);
  assert.equal(skyToneAt(sky, 1), sky[1]);

  const middle = unpack(skyToneAt(sky, 0.5));
  assert.ok(middle.r > 120 && middle.r < 136, `середина ${middle.r}`);
});

test('нейтральная палитра: без звёзд и менее насыщенная', () => {
  const normal = scenePalette({ altitudeDeg: 20 });
  const neutral = scenePalette({ altitudeDeg: 20, neutral: true });

  assert.equal(neutral.starOpacity, 0);
  assert.notDeepEqual(neutral.sky, normal.sky);

  const saturation = (color) => {
    const { r, g, b } = unpack(color);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  assert.ok(saturation(neutral.sky[0]) < saturation(normal.sky[0]));
});
