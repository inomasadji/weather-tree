// Дальний план (холмы) и поверхность земли: трава, текстура, снег и травинки у горизонта.

import { LOGICAL } from '../config.js';
import { Surface, bayerThreshold } from './surface.js';

/**
 * Скалистый гребень: две синусоиды дают силуэт без ассетов.
 * @param {Surface} surface
 * @param {{base: number, amplitude: number, period: number, phase: number, color: number, bottom: number}} options
 */
function ridge(surface, { base, amplitude, period, phase, color, bottom }) {
  for (let x = 0; x < surface.width; x += 1) {
    const y = Math.round(
      base +
        Math.sin((x + phase) / period) * amplitude +
        Math.sin((x + phase) / (period / 3.7)) * amplitude * 0.4,
    );
    surface.fillRect(x, y, 1, bottom - y, color);
  }
}

/**
 * Рисует дымку у горизонта и две гряды холмов поверх облаков.
 * @param {Surface} surface
 * @param {object} palette
 * @param {number} horizonY
 */
export function drawHills(surface, palette, horizonY) {
  const haze = palette.haze;
  for (let row = horizonY - 5; row < horizonY; row += 1) {
    const density = ((row - (horizonY - 6)) / 6) * 0.5;
    for (let col = 0; col < surface.width; col += 1) {
      if (bayerThreshold(col, row) < density) surface.pixel(col, row, haze);
    }
  }

  ridge(surface, {
    base: horizonY - 22,
    amplitude: 9,
    period: 46,
    phase: 20,
    color: palette.land.far,
    bottom: horizonY + 14,
  });
  ridge(surface, {
    base: horizonY - 12,
    amplitude: 6,
    period: 29,
    phase: 90,
    color: palette.land.near,
    bottom: horizonY + 16,
  });
}

/**
 * Земля, снежный покров и травинки у горизонта — для кэшируемого буфера.
 * @param {Surface} surface
 * @param {object} palette
 * @param {number} snowCover
 * @param {number} horizonY
 */
export function paintGround(surface, palette, snowCover, horizonY) {
  const { width, height } = surface;
  const { land } = palette;

  surface.fillRect(0, horizonY, width, height - horizonY, land.ground);

  // Текстура: детерминированный шум вместо Math.random().
  for (let y = horizonY + 2; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Surface.noise(x, y, 7);
      if (noise > 0.955) surface.pixel(x, y, land.light);
      else if (noise < 0.045) surface.pixel(x, y, land.dark);
    }
  }

  if (snowCover > 0.02) {
    for (let y = horizonY; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const noise = Surface.noise(x, y, 41);
        if (noise < snowCover) {
          surface.pixel(x, y, noise < snowCover * 0.75 ? land.snow : land.snowLight);
        }
      }
    }
  }

  const blades = Math.max(12, Math.round(26 * (width / LOGICAL.width)));
  for (let index = 0; index < blades; index += 1) {
    const x = Math.round(Surface.noise(index, 1, 31) * width);
    const bladeHeight = 1 + Math.round(Surface.noise(index, 2, 31) * 2);
    surface.fillRect(x, horizonY - bladeHeight, 1, bladeHeight, snowCover > 0.6 ? land.snow : land.light);
  }
}
