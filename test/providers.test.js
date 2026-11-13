import test from 'node:test';
import assert from 'node:assert/strict';

import { providerChain, PROVIDER_ORDER } from '../src/api/weather.js';

test('providerChain по умолчанию — сначала open-meteo', () => {
  assert.deepEqual(providerChain(null), ['open-meteo', 'wttr.in']);
});

test('providerChain поднимает запомненный провайдер наверх', () => {
  assert.deepEqual(providerChain('wttr.in'), ['wttr.in', 'open-meteo']);
});

test('providerChain игнорирует неизвестный id', () => {
  assert.deepEqual(providerChain('weather.gov'), PROVIDER_ORDER);
});
