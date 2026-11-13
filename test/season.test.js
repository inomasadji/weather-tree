import test from 'node:test';
import assert from 'node:assert/strict';

import { seasonKey, seasonPhase, seasonWeights } from '../src/model/season.js';

test('фаза года: 0 — зимнее солнцестояние, 0.5 — летнее', () => {
  assert.ok(Math.abs(seasonPhase(355, 'N')) < 0.01);
  assert.ok(Math.abs(seasonPhase(172, 'N') - 0.5) < 0.02);
});

test('южное полушарие сдвинуто на полгода', () => {
  assert.ok(Math.abs(seasonPhase(355, 'S') - 0.5) < 0.01);
  // 15 января в Сиднее — разгар лета, чуть позже солнцестояния.
  assert.ok(Math.abs(seasonPhase(15, 'S') - 0.567) < 0.02);
});

test('фаза всегда в диапазоне 0…1', () => {
  for (let day = 1; day <= 366; day += 7) {
    const phase = seasonPhase(day, 'N');
    assert.ok(phase >= 0 && phase < 1, `день ${day} → ${phase}`);
  }
});

test('seasonKey выбирает ближайший сезон', () => {
  assert.equal(seasonKey(0), 'winter');
  assert.equal(seasonKey(0.99), 'winter');
  assert.equal(seasonKey(0.25), 'spring');
  assert.equal(seasonKey(0.5), 'summer');
  assert.equal(seasonKey(0.75), 'autumn');
});

test('веса всегда дают в сумме единицу', () => {
  for (const phase of [0, 0.1, 0.33, 0.5, 0.77, 0.99]) {
    const weights = seasonWeights(phase);
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `фаза ${phase} → ${total}`);
  }
});

test('веса не пустые и содержат валидные ключи', () => {
  const keys = new Set(['winter', 'spring', 'summer', 'autumn']);
  for (const item of seasonWeights(0.4)) {
    assert.ok(keys.has(item.key));
    assert.ok(item.weight >= 0 && item.weight <= 1);
  }
});
