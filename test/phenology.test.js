import test from 'node:test';
import assert from 'node:assert/strict';

import { foliageState } from '../src/model/phenology.js';

test('зимой кроны нет', () => {
  const winter = foliageState(0);
  assert.equal(winter.coverage, 0);
  assert.equal(winter.stage, 'bare');
});

test('в разгар лета крона максимальная и без цветения', () => {
  const summer = foliageState(0.55);
  assert.ok(summer.coverage > 0.95, `покрытие ${summer.coverage}`);
  assert.equal(summer.blossom, 0);
  assert.equal(summer.stage, 'full');
});

test('весной есть цветение и молодая листва', () => {
  const spring = foliageState(0.3);
  assert.ok(spring.coverage > 0.1 && spring.coverage < 0.8);
  assert.ok(spring.blossom > 0.2);
  assert.equal(spring.stage, 'blossom');
});

test('осенью листва жёлто-красная и редеет', () => {
  const autumn = foliageState(0.9);
  assert.ok(autumn.coverage > 0.2 && autumn.coverage < 0.8, `покрытие ${autumn.coverage}`);

  const light = autumn.tones[0];
  const red = light & 255;
  const green = (light >>> 8) & 255;
  assert.ok(red > green, `красный ${red} должен быть больше зелёного ${green}`);
  assert.ok(autumn.litter > 0.1);
});

test('кривая непрерывна по фазе года', () => {
  const before = foliageState(0.449);
  const after = foliageState(0.451);
  assert.ok(Math.abs(before.coverage - after.coverage) < 0.02);
});

test('ветер и заморозки снимают листву быстрее', () => {
  const calm = foliageState(0.9, { tempC: 8, windKmh: 2 });
  const windy = foliageState(0.9, { tempC: -6, windKmh: 50 });
  assert.ok(windy.coverage < calm.coverage);
});

test('тона всегда три и они упакованы корректно', () => {
  const state = foliageState(0.62);
  assert.equal(state.tones.length, 3);
  for (const tone of state.tones) {
    assert.ok(Number.isInteger(tone) && tone > 0 && tone <= 0xffffffff);
    assert.equal(tone >>> 24, 255, 'альфа должна быть непрозрачной');
  }
});

test('фаза года зациклена', () => {
  const before = foliageState(0.99);
  const after = foliageState(-0.01);
  assert.ok(Math.abs(before.coverage - after.coverage) < 0.02);
});
