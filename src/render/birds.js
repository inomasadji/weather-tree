// Птицы: редкая стая, пересекающая небо. Позиция — функция времени и сида,
// поэтому кадр детерминирован: стая не «дёргается» и не появляется заново.
// Рисуется силуэтом в три пикселя — на 320×180 больше читается как шум.

import { hexColor, mixColor } from './color.js';
import { hash2 } from './noise.js';

const PERIOD_MS = 64_000;
const CROSS_MS = 18_000;

/**
 * Где стая в этот момент.
 * @param {number} timeMs
 * @param {number} width ширина буфера
 * @returns {{slot: number, progress: number, dir: number, x: number, y: number}|null}
 */
export function birdFlockAt(timeMs, width = 320) {
  const slot = Math.floor(timeMs / PERIOD_MS);
  // Больше половины слотов пустые: птицы — редкость, а не фон.
  if (hash2(slot, 1, 97) > 0.42) return null;

  const local = timeMs - slot * PERIOD_MS;
  if (local > CROSS_MS) return null;

  const progress = local / CROSS_MS;
  const dir = hash2(slot, 2, 97) > 0.5 ? 1 : -1;
  const x = (dir > 0 ? -8 : width + 8) + dir * progress * (width + 16);
  const y = 12 + hash2(slot, 3, 97) * 34;

  return { slot, progress, dir, x, y };
}

/**
 * Стая: три-пять силуэтов клином, с медленным взмахом.
 * @param {import('./surface.js').Surface} surface
 * @param {{timeMs: number, palette: object, shiftX?: number, shiftY?: number}} options
 */
export function drawBirds(surface, { timeMs, palette, shiftX = 0, shiftY = 0 }) {
  const flock = birdFlockAt(timeMs, surface.width);
  if (!flock) return;

  // Силуэт тёмный: птицы читаются на светлом небе, а не сливаются с облаками.
  const color = mixColor(hexColor('#1b2434'), palette.haze, 0.18);
  const count = 3 + Math.floor(hash2(flock.slot, 4, 97) * 3);
  const seconds = timeMs / 1000;

  for (let index = 0; index < count; index += 1) {
    // Клин: ведомые отстают и смещаются в сторону, противоположную движению.
    const lag = index * 4.5;
    const side = index % 2 === 0 ? 1 : -1;
    const flap = Math.sin(seconds * 5.2 + index * 1.3) > 0;

    const x = Math.round(flock.x - flock.dir * lag - shiftX);
    const y = Math.round(flock.y + side * (2 + index) + (flap ? 0 : 1) - shiftY);

    if (x < -2 || x > surface.width + 2 || y < 2 || y > surface.height) continue;

    surface.pixel(x, y, color);
    surface.pixel(x - 1, y + 1, color);
    surface.pixel(x + 1, y + 1, color);
    if (flap && index % 2 === 0) surface.pixel(x, y - 1, color);
  }
}
