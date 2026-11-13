import test from 'node:test';
import assert from 'node:assert/strict';

import { describeScene } from '../src/model/describe.js';

/** @param {object} weather @param {object} derived */
function worldWith(weather, derived = {}) {
  return {
    weather: {
      code: 0,
      tempC: 12,
      humidity: 60,
      windKmh: 4,
      gustKmh: 6,
      ...weather,
    },
    derived: { isDay: true, season: 0.55, ...derived },
  };
}

test('описание зимней метели упоминает снег и голые ветки', () => {
  const text = describeScene(
    worldWith({ code: 75, tempC: -11, windKmh: 28 }, { isDay: false, season: 0.02 }),
  );

  assert.match(text, /ночь/);
  assert.match(text, /сильный снег/);
  assert.match(text, /снегопад/);
  assert.match(text, /без листвы/);
  assert.match(text, /28 км\/ч/);
});

test('описание летнего дня упоминает листву', () => {
  const text = describeScene(worldWith({ code: 0, tempC: 24 }, { season: 0.55 }));
  assert.match(text, /день/);
  assert.match(text, /ясно/);
  assert.match(text, /в листве/);
  assert.doesNotMatch(text, /дождь|снегопад/);
});

test('дождь и туман попадают в описание', () => {
  const text = describeScene(worldWith({ code: 45, humidity: 98 }, { season: 0.6 }));
  assert.match(text, /туман/);
});

test('без мира — нейтральная подпись', () => {
  assert.equal(describeScene(null), 'Погодная сцена с деревом');
});
