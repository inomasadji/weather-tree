import test from 'node:test';
import assert from 'node:assert/strict';

import { createFrameGuard, createFramePacer } from '../src/ui/loop.js';

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

test('pacer: ограничивает частоту до maxFps на 120 Гц экране', () => {
  const pacer = createFramePacer({ maxFps: 60 });
  const drawn = [];

  for (let frame = 0; frame < 12; frame += 1) {
    const now = frame * 8.33; // ~120 Гц
    if (pacer.shouldDraw(now)) drawn.push(frame);
  }

  assert.equal(drawn.length, 6);
});

test('pacer: не пропускает кадры на 60 Гц с лёгким джиттером', () => {
  const pacer = createFramePacer({ maxFps: 60 });
  const timestamps = [0, 16.3, 32.8, 49.6, 66.2];

  assert.equal(timestamps.every((t) => pacer.shouldDraw(t)), true);
});
