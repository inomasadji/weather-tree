import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeWeather,
  formatTemp,
  formatWind,
  isPrecipitation,
  windCardinal,
} from '../src/model/weather.js';

test('describeWeather знает коды WMO', () => {
  assert.equal(describeWeather(0), 'Ясно');
  assert.equal(describeWeather(3), 'Пасмурно');
  assert.equal(describeWeather(71), 'Небольшой снег');
  assert.equal(describeWeather(95), 'Гроза');
});

test('describeWeather переводит дождь в мокрый снег при морозе', () => {
  assert.equal(describeWeather(61, 10), 'Небольшой дождь');
  assert.equal(describeWeather(61, -5), 'Небольшой мокрый снег');
  assert.equal(describeWeather(63, 0), 'Мокрый снег');
  assert.equal(describeWeather(65, -12), 'Сильный мокрый снег');
});

test('describeWeather не трогает снег и ясную погоду', () => {
  assert.equal(describeWeather(75, -20), 'Сильный снег');
  assert.equal(describeWeather(0, -20), 'Ясно');
});

test('describeWeather не падает на неизвестном коде', () => {
  assert.equal(describeWeather(1234), 'Погода без описания');
});

test('isPrecipitation: осадки, туман и ясно', () => {
  assert.equal(isPrecipitation(0), false);
  assert.equal(isPrecipitation(45), false);
  assert.equal(isPrecipitation(51), true);
  assert.equal(isPrecipitation(71), true);
  assert.equal(isPrecipitation(82), true);
  assert.equal(isPrecipitation(99), true);
});

test('windCardinal считает восемь румбов', () => {
  assert.equal(windCardinal(0), 'С');
  assert.equal(windCardinal(44), 'СВ');
  assert.equal(windCardinal(90), 'В');
  assert.equal(windCardinal(225), 'ЮЗ');
  assert.equal(windCardinal(360), 'С');
  assert.equal(windCardinal(-90), 'З');
  assert.equal(windCardinal(undefined), '—');
});

test('formatTemp использует типографский минус', () => {
  assert.equal(formatTemp(24), '+24°');
  assert.equal(formatTemp(-11), '−11°');
  assert.equal(formatTemp(0), '0°');
  assert.equal(formatTemp(-0.4), '0°');
  assert.equal(formatTemp(undefined), '—');
});

test('formatWind', () => {
  assert.equal(formatWind(28, 225), '28 км/ч ЮЗ');
  assert.equal(formatWind(4), '4 км/ч');
  assert.equal(formatWind(null), '—');
});
