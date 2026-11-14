// Дальний план (объёмные холмы), лесные массивы, 2.5D-тропинка и текстурированная земля.
// Всё рисуется в кэшируемый слой landscapeCache, не утяжеляя покадровый рендер.

import { LOGICAL } from '../config.js';
import { hexColor, mixColor } from './color.js';
import { Surface, bayerThreshold } from './surface.js';
import { hash2 } from './noise.js';
import {
  drawDistantForest,
  drawIsometricPath,
  drawPropsByDepth,
  drawTerraces,
} from './landscape/props.js';

const SHADOW = hexColor('#0d1526');

/** Волнистая линия перехода между холмами и лугом с мягким 2.5D-уклоном. */
const groundLine = (x, horizonY, width) =>
  Math.round(
    horizonY +
      (x / Math.max(1, width) - 0.5) * 3 +
      Math.sin(x / 37) * 1.3 +
      (Surface.noise(Math.floor(x / 3), 1, 19) - 0.5) * 2.4,
  );

function ridge(surface, { base, amplitude, period, phase, color, snowColor, snowCover, bottom, sunDir }) {
  const litTone = mixColor(color, snowColor, 0.16);
  const darkTone = mixColor(color, SHADOW, 0.12);

  for (let x = 0; x < surface.width; x += 1) {
    const y = Math.round(
      base +
        Math.sin((x + phase) / period) * amplitude +
        Math.sin((x + phase) / (period / 3.7)) * amplitude * 0.4,
    );
    // Гладкая производная без ступенек Math.round, чтобы склоны не полосили.
    const slope =
      Math.cos((x + phase) / period) * (amplitude / period) +
      Math.cos((x + phase) / (period / 3.7)) * ((amplitude * 0.4) / (period / 3.7));
    const facingSun = slope * sunDir < -0.06;
    const inShadow = slope * sunDir > 0.08;
    const slopeTone = facingSun ? litTone : inShadow ? darkTone : color;

    surface.fillRect(x, y, 1, bottom - y, color);
    if (slopeTone !== color) surface.fillRect(x, y, 1, Math.min(4, bottom - y), slopeTone);

    if (snowCover > 0.35 && Surface.noise(x, y, 29) < (snowCover - 0.3) * 0.7) {
      surface.fillRect(x, y, 1, 2, mixColor(slopeTone, snowColor, 0.55));
    }
  }
}

/**
 * Строит кэшируемый буфер 2.5D-ландшафта: холмы со светотенью, дальний лес,
 * тропинка, террасы, земля с перспективной фактурой и три плана кустов/камней.
 * @param {Surface} surface
 * @param {object} options
 * @returns {{minY: number, maxGroundY: number}}
 */
export function paintLandscape(surface, {
  palette,
  snowCover,
  horizonY,
  baseX,
  seed,
  lat,
  foliage,
  sunDir = 1,
}) {
  const { width, height } = surface;
  const { land } = palette;
  surface.clear(0);

  ridge(surface, {
    base: horizonY - 22,
    amplitude: 9,
    period: 46,
    phase: 20,
    color: land.far,
    snowColor: land.snowLight,
    snowCover,
    bottom: horizonY + 8,
    sunDir,
  });

  ridge(surface, {
    base: horizonY - 11,
    amplitude: 6,
    period: 29,
    phase: 90,
    color: land.near,
    snowColor: land.snow,
    snowCover,
    bottom: horizonY + 8,
    sunDir,
  });

  drawDistantForest(surface, { palette, foliage, horizonY, baseX, seed, lat, snowCover });

  let maxGroundY = horizonY;
  for (let x = 0; x < width; x += 1) {
    const gy = groundLine(x, horizonY, width);
    if (gy > maxGroundY) maxGroundY = gy;
    surface.fillRect(x, gy, 1, height - gy, land.ground);

    const edgeNoise = Surface.noise(x, gy, 31);
    if (edgeNoise > 0.62) {
      const tuftH = edgeNoise > 0.86 ? 2 : 1;
      surface.fillRect(x, gy - tuftH, 1, tuftH, snowCover > 0.55 ? land.snow : land.light);
    }
  }

  for (let y = horizonY + 2; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Surface.noise(x, y, 7);
      if (noise > 0.955) surface.pixel(x, y, land.light);
      else if (noise < 0.045) surface.pixel(x, y, land.dark);
    }
  }

  drawIsometricPath(surface, { palette, horizonY, baseX, snowCover, sunDir });
  drawTerraces(surface, { palette, horizonY, baseX, seed, snowCover, sunDir });

  if (snowCover > 0.02) {
    for (let y = horizonY - 2; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (y < groundLine(x, horizonY, width)) continue;
        const noise = Surface.noise(x, y, 41);
        if (noise < snowCover) {
          surface.pixel(x, y, noise < snowCover * 0.75 ? land.snow : land.snowLight);
        }
      }
    }
  }

  drawPropsByDepth(surface, { palette, foliage, horizonY, baseX, seed, snowCover, sunDir });

  // Перспективные пучки травы: мелкие вдали, крупные V-пучки на переднем плане.
  const spanY = Math.max(8, height - horizonY - 6);
  const tufts = Math.max(16, Math.round(32 * (width / LOGICAL.width)));
  for (let index = 0; index < tufts; index += 1) {
    const depth = hash2(index, 2, 71);
    const x = Math.round(hash2(index, 1, 71) * (width - 6)) + 3;
    const y = Math.round(horizonY + 4 + depth * spanY);
    const tone = snowCover > 0.6 ? land.snowLight : land.light;

    surface.pixel(x, y, tone);
    if (depth > 0.35) surface.pixel(x - 1, y - 1, tone);
    if (depth > 0.55 && hash2(index, 3, 71) > 0.4) surface.pixel(x + 1, y - 1, tone);
    if (depth > 0.78) surface.pixel(x, y - 2, tone);
  }

  return {
    minY: Math.max(0, horizonY - 36),
    maxGroundY: Math.min(height, maxGroundY + 1),
  };
}

/** Дымка у горизонта поверх неба и облаков. */
export function drawHorizonHaze(surface, palette, horizonY) {
  const haze = palette.haze;
  for (let row = horizonY - 5; row < horizonY; row += 1) {
    const density = ((row - (horizonY - 6)) / 6) * 0.5;
    for (let col = 0; col < surface.width; col += 1) {
      if (bayerThreshold(col, row) < density) surface.pixel(col, row, haze);
    }
  }
}
