import test from 'node:test';
import assert from 'node:assert/strict';

import { computeStageLayout } from '../src/ui/stage.js';

const VIEWPORTS = [
  { name: '1920x1080 (Full HD)', width: 1920, height: 1080 },
  { name: '1440x900 (16:10)', width: 1440, height: 900 },
  { name: '1366x768 (ноутбук)', width: 1366, height: 768 },
  { name: '2560x1080 (Ultrawide)', width: 2560, height: 1080 },
  { name: '768x1024 (планшет портрет)', width: 768, height: 1024 },
  { name: '390x844 (телефон портрет)', width: 390, height: 844 },
  { name: '360x800 (узкий телефон)', width: 360, height: 800 },
  { name: '320x568 (iPhone SE)', width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test(`layout заполняет 100 % экрана без обрезки дерева: ${vp.name}`, () => {
    const layout = computeStageLayout(vp.width, vp.height);

    assert.ok(layout.cssWidth >= vp.width, `cssWidth=${layout.cssWidth} < ${vp.width}`);
    assert.ok(layout.cssHeight >= vp.height, `cssHeight=${layout.cssHeight} < ${vp.height}`);
    assert.ok(layout.logicalWidth >= 180, `logicalWidth=${layout.logicalWidth} слишком узкий для дерева`);
    assert.ok(layout.logicalHeight >= 180, `logicalHeight=${layout.logicalHeight} слишком низкий`);
    assert.ok(layout.scale >= 1);
  });
}

test('Full HD 1920x1080 даёт ровно 320x180 с масштабом 6x', () => {
  const layout = computeStageLayout(1920, 1080);
  assert.deepEqual(layout, {
    scale: 6,
    logicalWidth: 320,
    logicalHeight: 180,
    cssWidth: 1920,
    cssHeight: 1080,
  });
});

test('телефон 390x844 даёт целый масштаб 2x и портретный буфер', () => {
  const layout = computeStageLayout(390, 844);
  assert.equal(layout.scale, 2);
  assert.equal(layout.logicalWidth, 195);
  assert.equal(layout.logicalHeight, 422);
});
