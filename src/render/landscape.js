// Дальний план (холмы), лесные массивы по широтам, кусты среднего плана и текстурированная земля.
// Всё рисуется в кэшируемый слой, поэтому не утяжеляет покадровый рендер.

import { LOGICAL } from '../config.js';
import { hexColor, mixColor } from './color.js';
import { Surface, bayerThreshold } from './surface.js';
import { hash2 } from './noise.js';
import { shade } from '../model/palette.js';
import { forestDensity, speciesFor } from '../model/species.js';

const BARK_DARK = hexColor('#3d2f24');

/** Волнистая линия перехода между холмами и лугом — вместо ровной линейки. */
const groundLine = (x, horizonY) =>
  Math.round(horizonY + Math.sin(x / 37) * 1.4 + (Surface.noise(Math.floor(x / 3), 1, 19) - 0.5) * 2.5);

function ridge(surface, { base, amplitude, period, phase, color, snowColor, snowCover, bottom }) {
  for (let x = 0; x < surface.width; x += 1) {
    const y = Math.round(
      base +
        Math.sin((x + phase) / period) * amplitude +
        Math.sin((x + phase) / (period / 3.7)) * amplitude * 0.4,
    );
    surface.fillRect(x, y, 1, bottom - y, color);

    if (snowCover > 0.35 && Surface.noise(x, y, 29) < (snowCover - 0.3) * 0.7) {
      surface.fillRect(x, y, 1, 2, mixColor(color, snowColor, 0.55));
    }
  }
}

/**
 * Полоса дальнего леса вдоль подножия холмов: плотность зависит от широты.
 */
function drawDistantForest(surface, { palette, foliage, horizonY, baseX, seed, lat, snowCover }) {
  const density = forestDensity(lat, seed);
  if (density < 0.08) return;

  const species = speciesFor(lat, seed);
  const spiky = Math.abs(lat) >= 54 || species === 'conifer';
  const light = Math.max(0.14, palette.light);

  const canopyBase = foliage.coverage > 0.15
    ? shade(foliage.tones[2], light)
    : shade(BARK_DARK, light);
  const canopyLit = foliage.coverage > 0.15
    ? shade(foliage.tones[1], light)
    : shade(palette.land.near, light);

  // Воздушная перспектива: лес приглушён дымкой и близок к тону дальних холмов.
  const bodyTone = mixColor(mixColor(canopyBase, palette.land.near, 0.38), palette.haze, 0.38);
  const topTone = mixColor(mixColor(canopyLit, palette.land.near, 0.3), palette.haze, 0.32);

  for (let x = 0; x < surface.width; x += 1) {
    const clearNearHero = Math.abs(x - baseX) < 34 ? 0.45 : 1;
    const band = Math.sin(x / 31 + (seed & 255) * 0.03) * 0.35 + Surface.noise(Math.floor(x / 5), 3, seed) * 0.65;
    if (band * clearNearHero < (1 - density) * 0.82) continue;

    const jitter = Surface.noise(x, 7, seed);
    const patch = Surface.noise(Math.floor(x / 7), 11, seed);
    let treeH;
    if (spiky) {
      const w = 4 + Math.floor(patch * 4);
      const spire = 1 - Math.abs(((x % w) - w / 2) / (w * 0.6));
      treeH = Math.round((2 + spire * 6 + patch * 4 + jitter * 2) * clearNearHero);
    } else {
      const w = 6 + Math.floor(patch * 6);
      const dome = Math.sin(((x % w) / w) * Math.PI);
      treeH = Math.round((3 + dome * 5 + patch * 4 + jitter * 2) * clearNearHero);
    }

    const base = horizonY + 2;
    const top = base - Math.max(2, treeH);
    surface.fillRect(x, top, 1, base - top, bodyTone);
    surface.pixel(x, top, snowCover > 0.4 && jitter < snowCover * 0.65 ? palette.land.snow : topTone);
  }
}

/**
 * Небольшие кусты и подрост вдоль горизонта для глубины и мягкого перехода.
 */
function drawMidgroundBushes(surface, { palette, foliage, horizonY, baseX, seed, snowCover }) {
  const light = Math.max(0.15, palette.light);
  const tones = foliage.tones.map((c) => shade(c, light));
  const twig = shade(BARK_DARK, light);
  const shadow = mixColor(palette.land.ground, hexColor('#0d1526'), 0.45);
  const count = surface.width < 240 ? 2 : 4;

  for (let index = 0; index < count; index += 1) {
    const x = Math.round((0.12 + index * (0.76 / Math.max(1, count - 1)) + (hash2(index, 1, seed) - 0.5) * 0.12) * surface.width);
    if (Math.abs(x - baseX) < 36 || x < 10 || x > surface.width - 10) continue;

    const y = groundLine(x, horizonY) + Math.round(hash2(index, 2, seed) * 2);
    const rx = Math.round(4 + hash2(index, 3, seed) * 4);
    const ry = Math.round(3 + hash2(index, 4, seed) * 3);

    surface.ellipse(x, y + 1, rx, 1, shadow);

    for (let dy = -ry; dy <= 0; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) {
        const dist = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
        if (dist > 1) continue;
        const px = x + dx;
        const py = y + dy;
        const grain = Surface.noise(px, py, 23 + index);
        if (dist > 0.78 && grain < 0.4) continue;

        if (foliage.coverage < 0.12) {
          if (grain > 0.55) surface.pixel(px, py, twig);
          if (snowCover > 0.3 && dy <= -ry + 1 && grain < snowCover * 0.7) {
            surface.pixel(px, py, palette.land.snow);
          }
          continue;
        }

        const color = dy < -ry * 0.35 ? tones[0] : dy > -1 ? tones[2] : tones[1];
        surface.pixel(px, py, color);
        if (snowCover > 0.45 && dy <= -ry + 1 && grain < snowCover * 0.6) {
          surface.pixel(px, py - 1, palette.land.snow);
        }
      }
    }
  }
}

/**
 * Строит кэшируемый буфер фона: холмы, дальний лес, земля, кусты и кочки у горизонта.
 * Пиксели выше холмов остаются прозрачными (0), чтобы не перекрывать небо и облака.
 * @param {Surface} surface
 * @param {object} options
 * @returns {{minY: number, maxGroundY: number}}
 */
export function paintLandscape(surface, { palette, snowCover, horizonY, baseX, seed, lat, foliage }) {
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
    bottom: horizonY + 6,
  });

  ridge(surface, {
    base: horizonY - 11,
    amplitude: 6,
    period: 29,
    phase: 90,
    color: land.near,
    snowColor: land.snow,
    snowCover,
    bottom: horizonY + 6,
  });

  drawDistantForest(surface, { palette, foliage, horizonY, baseX, seed, lat, snowCover });

  let maxGroundY = horizonY;
  for (let x = 0; x < width; x += 1) {
    const gy = groundLine(x, horizonY);
    if (gy > maxGroundY) maxGroundY = gy;
    surface.fillRect(x, gy, 1, height - gy, land.ground);

    // Мягкий стык у кромки: пучки травы и кочки ломают резкую границу с холмами.
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

  if (snowCover > 0.02) {
    for (let y = horizonY - 1; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (y < groundLine(x, horizonY)) continue;
        const noise = Surface.noise(x, y, 41);
        if (noise < snowCover) {
          surface.pixel(x, y, noise < snowCover * 0.75 ? land.snow : land.snowLight);
        }
      }
    }
  }

  drawMidgroundBushes(surface, { palette, foliage, horizonY, baseX, seed, snowCover });

  // Травинки и кочки на переднем плане для живой фактуры.
  const tufts = Math.max(14, Math.round(28 * (width / LOGICAL.width)));
  for (let index = 0; index < tufts; index += 1) {
    const x = Math.round(hash2(index, 1, 71) * (width - 4)) + 2;
    const y = Math.round(horizonY + 8 + hash2(index, 2, 71) * Math.max(8, height - horizonY - 12));
    const tone = snowCover > 0.6 ? land.snowLight : land.light;
    surface.pixel(x, y, tone);
    surface.pixel(x - 1, y - 1, tone);
    if (hash2(index, 3, 71) > 0.5) surface.pixel(x + 1, y - 1, tone);
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
