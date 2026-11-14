// Небо: градиент полосами, звёзды, Млечный путь.

import { HORIZON_Y } from '../config.js';
import { Surface, bayerThreshold } from './surface.js';
import { skyToneAt } from '../model/palette.js';
import { mixColor } from './color.js';
import { hash2 } from './noise.js';

const STAR_COUNT = 130;

/** Позиции, яркость и темп мерцания фиксированы: ночное небо не должно «кишеть» по-новому. */
const STARS = Array.from({ length: STAR_COUNT }, (_, index) => ({
  nx: hash2(index, 1, 3),
  ny: hash2(index, 2, 5),
  // Квадрат сдвигает распределение к тусклым звёздам: ярких мало.
  brightness: 0.18 + hash2(index, 3, 7) ** 2 * 0.82,
  phase: hash2(index, 4, 11) * Math.PI * 2,
  /** Свой период мерцания 3–7 с: звёзды не мигают в такт друг другу. */
  period: 3 + hash2(index, 5, 13) * 4,
}));

/**
 * @param {import('./surface.js').Surface} surface
 * @param {object} palette
 * @param {number} [horizonY]
 */
export function drawSky(surface, palette, horizonY = HORIZON_Y) {
  const stops = palette.sky.map((color, index) => ({
    at: index / Math.max(1, palette.sky.length - 1),
    color,
  }));

  surface.gradientV(0, 0, surface.width, horizonY, stops, { bands: 12 });
}

/**
 * @param {import('./surface.js').Surface} surface
 * @param {{palette: object, starOpacity: number, timeMs: number, horizonY?: number}} options
 */
export function drawStars(surface, { palette, starOpacity, timeMs, horizonY = HORIZON_Y }) {
  if (starOpacity < 0.04) return;
  const skySpanY = Math.max(1, horizonY - 14);

  for (const star of STARS) {
    const x = Math.floor(star.nx * surface.width);
    const y = Math.floor(star.ny * skySpanY);

    // Мерцание медленное, у каждой звезды свой период 3–7 с: ночью не должно рябить.
    const twinkle = 0.82 + 0.18 * Math.sin((timeMs / 1000) * ((Math.PI * 2) / star.period) + star.phase);
    const visibility = starOpacity * star.brightness * twinkle;
    if (visibility <= bayerThreshold(x, y)) continue;

    surface.pixel(x, y, palette.star);

    // Крестик — только у редких ярких звёзд, иначе небо превращается в блёстки.
    if (star.brightness > 0.92 && starOpacity > 0.7) {
      surface.pixel(x - 1, y, palette.star);
      surface.pixel(x + 1, y, palette.star);
      surface.pixel(x, y - 1, palette.star);
      surface.pixel(x, y + 1, palette.star);
    }
  }
}

/**
 * Млечный путь — не гирлянда из точек, а разреженная дымка:
 * пиксели чуть светлее неба, плотность задаётся шумом.
 * @param {import('./surface.js').Surface} surface
 * @param {{palette: object, starOpacity: number, horizonY?: number}} options
 */
export function drawMilkyWay(surface, { palette, starOpacity, horizonY = HORIZON_Y }) {
  if (starOpacity < 0.55) return;

  const glow = mixColor(skyToneAt(palette.sky, 0.2), palette.star, 0.35);
  const baseCenter = (24 / HORIZON_Y) * horizonY;

  for (let x = 0; x < surface.width; x += 1) {
    const center = baseCenter + Math.sin(x / 74) * 11 + x * 0.05 + Surface.noise(x, 3, 23) * 6;
    const thickness = 5 + Math.sin(x / 23) * 2;

    for (let offset = -9; offset <= 9; offset += 1) {
      const y = Math.round(center + offset);
      if (y < 0 || y > horizonY - 6) continue;

      const falloff = Math.max(0, 1 - Math.abs(offset) / (thickness + 4));
      const grain = Surface.noise(x, y, 19);
      const density = falloff * starOpacity * (0.04 + grain * 0.16);
      if (bayerThreshold(x, y) < density) surface.pixel(x, y, glow);
    }
  }
}
