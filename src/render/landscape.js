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

function ridge(surface, { base, amplitude, period, phase, color, snowColor, snowCover, bottom, sunDir, hazeColor, hazeMix = 0 }) {
  // Воздушная перспектива: дальняя гряда сильнее уходит в дымку, ближняя — слабее.
  const ridgeColor = mixColor(color, hazeColor, hazeMix);
  const litTone = mixColor(ridgeColor, snowColor, 0.16);
  const darkTone = mixColor(ridgeColor, SHADOW, 0.12);

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
    const slopeTone = facingSun ? litTone : inShadow ? darkTone : ridgeColor;

    surface.fillRect(x, y, 1, bottom - y, ridgeColor);
    if (slopeTone !== ridgeColor) surface.fillRect(x, y, 1, Math.min(4, bottom - y), slopeTone);

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
  rime = 0,
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
    hazeColor: palette.haze,
    hazeMix: 0.34,
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
    hazeColor: palette.haze,
    hazeMix: 0.16,
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

  // Иней на траве: те же пучки, но с холодной кромкой на верхушках.
  if (rime > 0.05) {
    for (let index = 0; index < tufts; index += 1) {
      const x = Math.round(hash2(index, 1, 71) * (width - 6)) + 3;
      const y = Math.round(horizonY + 4 + hash2(index, 2, 71) * spanY);
      if (hash2(index, 5, 73) > rime * 0.7) continue;
      surface.pixel(x, y - 1, palette.rime);
    }
  }

  return {
    minY: Math.max(0, horizonY - 36),
    maxGroundY: Math.min(height, maxGroundY + 1),
  };
}

/**
 * Ближний план: тёмная трава и валуны у нижней кромки кадра. Единственный слой,
 * который перекрывает дерево, — он и даёт ощущение, что камера стоит в траве.
 * Рисуется каждый кадр (элементов мало), трава качается вместе с ветром.
 * @param {import('./surface.js').Surface} surface
 * @param {{palette: object, windAmp?: number, timeMs?: number, seed?: number,
 *          baseX?: number, snowCover?: number}} options
 */
export function drawNearForeground(surface, {
  palette,
  windAmp = 0,
  timeMs = 0,
  seed = 0,
  baseX = -100,
  snowCover = 0,
  viewX = 0,
  viewY = 0,
}) {
  const { width, height } = surface;
  const seconds = timeMs / 1000;
  const dark = mixColor(palette.land.dark, hexColor('#05080d'), 0.55);
  const mid = mixColor(palette.land.near, hexColor('#060b12'), 0.35);
  const top = snowCover > 0.35 ? mixColor(mid, palette.land.snow, 0.45) : mid;

  // Ближний план рисуется «крупным пикселем»: блок 2×2 читается как расфокус
  // переднего плана, и глаз ставит его ближе дерева и холмов.
  const block = width >= 280 ? 2 : 1;
  const hw = Math.floor(width / block);
  const hh = Math.floor(height / block);
  const tuftBaseX = Math.round(baseX / block);
  // Параллакс ближнего плана: трава едет по движению камеры, сильнее чем небо.
  const shiftX = Math.round(viewX / block);
  const shiftY = Math.round(viewY / block);

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= hw || y >= hh) return;
    surface.fillRect(x * block, y * block, block, block, color);
  };

  // Неровная полоса у самой кромки: рамка кадра, «объектив в траве».
  const band = Math.max(2, Math.round(hh * 0.05));
  for (let x = 0; x < hw; x += 1) {
    const wobble = Math.round(Surface.noise(Math.floor(x / 2), 5, seed + 11) * band * 1.8);
    for (let y = Math.max(0, hh - band - wobble); y < hh; y += 1) put(x, y, dark);
  }

  // Валуны: тёмные, с подсвеченной кромкой — читаются как ближний план.
  for (let index = 0; index < 2; index += 1) {
    const rx = 5 + Math.round(hash2(index, 6, seed + 7) * 4);
    const ry = 2 + Math.round(hash2(index, 7, seed + 7) * 2);
    const x = Math.round(7 + hash2(index, 8, seed + 7) * (hw - 14)) + shiftX;
    if (Math.abs(x - tuftBaseX) < 9 + rx) continue;

    for (let dy = -ry; dy <= 0; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        put(x + dx, hh - 1 + dy - shiftY, dy === -ry ? top : dark);
      }
    }
  }

  // Пучки травы: стебли гнутся под ветром и не заслоняют комель.
  const count = Math.max(6, Math.min(14, Math.round(hw / 17)));
  for (let index = 0; index < count; index += 1) {
    const tuftX = Math.round(2 + hash2(index, 1, seed + 3) * (hw - 4)) + shiftX;
    if (Math.abs(tuftX - tuftBaseX) < 8) continue;

    const phase = hash2(index, 4, seed) * Math.PI * 2;
    const sway = Math.sin(seconds * 1.4 + phase) * windAmp * 1.3;
    // Часть стеблей тянется выше полосы — так ближний план читается силуэтом.
    const tall = Math.max(3, Math.round(4 + hash2(index, 2, seed + 5) * hh * 0.09));

    for (let blade = 0; blade < 3; blade += 1) {
      const bend = sway * (0.6 + blade * 0.3) + (blade - 1) * 2.2;
      const bladeH = Math.max(2, Math.round(tall * (0.66 + hash2(index * 3 + blade, 9, seed) * 0.5)));
      const color = blade === 1 ? top : dark;

      for (let step = 0; step < bladeH; step += 1) {
        const t = step / bladeH;
        put(Math.round(tuftX + bend * t * t), hh - 1 - step, color);
      }
    }
  }
}

/** Дымка у горизонта поверх неба и облаков: толще и теплее на низком солнце. */
export function drawHorizonHaze(surface, palette, horizonY) {
  const haze = palette.haze;
  const span = Math.max(2, Math.round(palette.hazeSpan ?? 5));

  for (let row = horizonY - span; row < horizonY; row += 1) {
    const density = ((row - (horizonY - span - 1)) / (span + 1)) * 0.5;
    for (let col = 0; col < surface.width; col += 1) {
      if (bayerThreshold(col, row) < density) surface.pixel(col, row, haze);
    }
  }
}
