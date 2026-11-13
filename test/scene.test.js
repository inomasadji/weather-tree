// Golden-кадр: страховка от случайных изменений пиксельного рантайма.
// Хеш меняется при намеренной правке сцены — тогда обновите константу
// и опишите причину в коммите (см. AGENTS.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Surface } from '../src/render/surface.js';
import { renderScene, HORIZON } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';

const EXPECTED_HASH = 'df7286e621365749';

const hashOf = (surface) =>
  createHash('sha256').update(surface.data).digest('hex').slice(0, 16);

test('сцена M2 рендерится детерминированно', () => {
  const first = new Surface(LOGICAL.width, LOGICAL.height);
  const second = new Surface(LOGICAL.width, LOGICAL.height);

  renderScene(first);
  renderScene(second);

  assert.deepEqual(first.data, second.data);
});

test('golden-кадр M2 не изменился', () => {
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface);

  assert.equal(hashOf(surface), EXPECTED_HASH);
});

test('сцена заполняет весь буфер, альфа непрозрачная', () => {
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  renderScene(surface);

  for (let index = 3; index < surface.data.length; index += 4) {
    assert.equal(surface.data[index], 255);
  }
});

test('горизонт внутри буфера', () => {
  assert.ok(HORIZON > 0 && HORIZON < LOGICAL.height);
});
