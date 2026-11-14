// Полярное сияние: лента с висящими вниз лучами. Как и всё в сцене, кадр
// детерминирован: изгиб и яркость — функции времени, сида и силы сияния.

import { HORIZON_Y } from '../config.js';
import { Surface, bayerThreshold } from './surface.js';

/**
 * @param {import('./surface.js').Surface} surface
 * @param {{strength: number, palette: object, timeMs: number, seed?: number,
 *          horizonY?: number}} options
 */
export function drawAurora(surface, { strength, palette, timeMs, seed = 0, horizonY = HORIZON_Y }) {
  if (strength < 0.04 || !palette?.aurora) return;

  const core = palette.aurora.core;
  const glow = palette.aurora.glow;
  const seconds = timeMs / 1000;
  const width = surface.width;
  const limitY = horizonY - 8;

  for (let x = 0; x < width; x += 1) {
    // Не каждый столбец — луч: сплошная стена читается как «матрица», а не как сияние.
    const density = Surface.noise(x, 2, seed + 23);
    if (density < 0.3) continue;

    // Лента медленно дышит и изгибается: две волны разной длины дают «ткань».
    const wave = Math.sin(x / 40 + seconds * 0.16) * 9 + Math.sin(x / 13 - seconds * 0.09) * 3.5;
    const baseY = Math.round(10 + wave + Surface.noise(x, 5, seed + 3) * 7);
    const rayLen = Math.round((16 + Surface.noise(x, 9, seed + 11) * 26) * (0.45 + strength * 0.55));

    for (let y = baseY; y < Math.min(limitY, baseY + rayLen); y += 1) {
      const depth = (y - baseY) / Math.max(1, rayLen);
      // К низу луч растворяется; дизеринг делает это пиксельно честно.
      const alpha = strength * (1 - depth) ** 2.2 * (0.55 + density * 0.45);
      if (bayerThreshold(x, y) >= alpha) continue;
      surface.pixel(x, y, depth < 0.3 ? core : glow);
    }

    // Кромка ленты: у настоящего сияния она ярче и резче остального.
    if (strength > 0.3 && bayerThreshold(x, baseY) < strength * 0.85) {
      surface.pixel(x, baseY, core);
    }
  }
}
