import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchKp, lastKp } from '../src/api/aurora.js';
import { auroraEdgeLat, auroraStrength } from '../src/model/aurora.js';
import { drawAurora } from '../src/render/aurora.js';
import { Surface } from '../src/render/surface.js';
import { scenePalette } from '../src/model/palette.js';

const palette = scenePalette({ altitudeDeg: -25, seasonPhase: 0 });

test('lastKp берёт последнюю строку и понимает оба регистра поля', () => {
  assert.equal(lastKp([{ Kp: 1 }, { Kp: 5.33 }]), 5.33);
  assert.equal(lastKp([{ kp: 2.67 }]), 2.67);
  assert.equal(lastKp([]), null);
  assert.equal(lastKp(null), null);
  assert.equal(lastKp([{ foo: 1 }]), null);
});

test('lastKp зажимает значение в диапазон 0…9', () => {
  assert.equal(lastKp([{ Kp: 12 }]), 9);
  assert.equal(lastKp([{ Kp: -3 }]), 0);
});

test('граница овала спускается к экватору с ростом Kp', () => {
  assert.ok(auroraEdgeLat(9) < auroraEdgeLat(5));
  assert.ok(auroraEdgeLat(5) < auroraEdgeLat(0));
  assert.equal(Math.round(auroraEdgeLat(0)), 67);
  assert.equal(Math.round(auroraEdgeLat(5)), 54);
});

test('сияние видно на севере при сильной буре и не видно в Москве при слабой', () => {
  const murmansk = auroraStrength({ kp: 7, lat: 68.96, sunAltitudeDeg: -30, cloudPct: 5 });
  const moscow = auroraStrength({ kp: 2, lat: 55.76, sunAltitudeDeg: -30, cloudPct: 5 });

  assert.ok(murmansk > 0.8, `Мурманск: ${murmansk}`);
  assert.equal(moscow, 0, 'при Kp 2 овал не доходит до Москвы');
});

test('сияние гаснет днём и за облаками', () => {
  const night = { kp: 7, lat: 68.96, sunAltitudeDeg: -30, cloudPct: 0 };
  assert.equal(auroraStrength({ ...night, sunAltitudeDeg: 10 }), 0, 'днём сияния не видно');
  assert.equal(auroraStrength({ ...night, sunAltitudeDeg: -2 }), 0, 'в сумерки ещё рано');
  assert.ok(auroraStrength({ ...night, cloudPct: 100 }) < auroraStrength(night) * 0.2);
});

test('в южном полушарии работает зеркально (aurora australis)', () => {
  const south = auroraStrength({ kp: 7, lat: -68.96, sunAltitudeDeg: -30, cloudPct: 5 });
  const north = auroraStrength({ kp: 7, lat: 68.96, sunAltitudeDeg: -30, cloudPct: 5 });
  assert.equal(south, north);
});

test('fetchKp: сетевой сбой не бросает исключение', async () => {
  const result = await fetchKp({ timeoutMs: 1, retries: 0, fetchJson: undefined });
  assert.equal(typeof result.ok, 'boolean');
});

test('drawAurora: рисует только при силе и детерминирован', () => {
  const first = new Surface(320, 180);
  const second = new Surface(320, 180);
  first.clear(0);
  second.clear(0);

  drawAurora(first, { strength: 1, palette, timeMs: 1_000, seed: 7 });
  drawAurora(second, { strength: 1, palette, timeMs: 1_000, seed: 7 });

  assert.deepEqual(first.pixels, second.pixels);
  const lit = first.pixels.filter((pixel) => pixel !== 0).length;
  assert.ok(lit > 300, `пикселей сияния: ${lit}`);

  const off = new Surface(320, 180);
  off.clear(0);
  drawAurora(off, { strength: 0, palette, timeMs: 1_000, seed: 7 });
  assert.equal(off.pixels.filter((pixel) => pixel !== 0).length, 0);
});
