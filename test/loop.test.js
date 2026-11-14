import test from 'node:test';
import assert from 'node:assert/strict';

import { createFrameGuard } from '../src/ui/loop.js';

test('guard: успешный кадр сбрасывает счётчик', () => {
  const guard = createFrameGuard({ maxErrors: 3, onError: () => {} });

  assert.equal(guard.attempt(() => {}), true);
  assert.equal(guard.failures, 0);
  assert.equal(guard.exhausted, false);
});

test('guard: ошибки копятся и приводят к остановке', () => {
  const guard = createFrameGuard({ maxErrors: 2, onError: () => {} });
  const boom = () => {
    throw new Error('boom');
  };

  assert.equal(guard.attempt(boom), false);
  assert.equal(guard.failures, 1);
  assert.equal(guard.exhausted, false);

  assert.equal(guard.attempt(boom), false);
  assert.equal(guard.failures, 2);
  assert.equal(guard.exhausted, true);
});

test('guard: успех после ошибки обнуляет серию', () => {
  const guard = createFrameGuard({ maxErrors: 2, onError: () => {} });
  guard.attempt(() => {
    throw new Error('boom');
  });
  assert.equal(guard.failures, 1);

  guard.attempt(() => {});
  assert.equal(guard.failures, 0);
  assert.equal(guard.exhausted, false);
});
