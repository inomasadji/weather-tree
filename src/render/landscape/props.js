// Изометрические элементы ландшафта: дальний лес, 2.5D-тропинка, террасы,
// а также кусты и камни на трёх планах глубины (far / mid / near).

import { hexColor, mixColor } from '../color.js';
import { Surface } from '../surface.js';
import { hash2 } from '../noise.js';
import { shade } from '../../model/palette.js';
import { forestDensity, speciesFor } from '../../model/species.js';

const BARK_DARK = hexColor('#3d2f24');
const ROCK_BASE = hexColor('#5a626e');
const ROCK_LIGHT = hexColor('#7e8794');
const SHADOW = hexColor('#0d1526');

/**
 * Полоса дальнего леса вдоль подножия холмов: плотность зависит от широты.
 */
export function drawDistantForest(surface, { palette, foliage, horizonY, baseX, seed, lat, snowCover }) {
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

    const base = horizonY + 3;
    const top = base - Math.max(2, treeH);
    surface.fillRect(x, top, 1, base - top, bodyTone);
    surface.pixel(x, top, snowCover > 0.4 && jitter < snowCover * 0.65 ? palette.land.snow : topTone);
  }
}

/**
 * Пологая 2.5D-тропинка с перспективным сужением к горизонту.
 */
export function drawIsometricPath(surface, { palette, horizonY, baseX, snowCover, sunDir }) {
  const { width, height } = surface;
  const { land } = palette;
  const spanY = Math.max(1, height - horizonY);
  const startX = Math.min(width - 14, Math.max(baseX + 38, Math.round(width * 0.7)));
  const endX = Math.round(width * 0.44);

  const pathTone = snowCover > 0.45
    ? mixColor(land.snow, land.ground, 0.24)
    : mixColor(land.ground, shade(hexColor('#746249'), Math.max(0.18, palette.light)), 0.45);
  const edgeTone = snowCover > 0.45 ? land.snowLight : land.light;

  for (let y = horizonY + 2; y < height; y += 1) {
    const depth = (y - horizonY) / spanY;
    // Плавный S-изгиб по изометрической диагонали.
    const cx = startX + (endX - startX) * (1 - depth) ** 1.15 + Math.sin(depth * Math.PI) * 10;
    const halfW = 1 + depth * 5.5;
    const x0 = Math.round(cx - halfW);
    const x1 = Math.round(cx + halfW);

    for (let x = x0; x <= x1; x += 1) {
      if (Surface.noise(x, y, 59) < 0.12) continue;
      surface.pixel(x, y, pathTone);
    }
    const rimX = sunDir > 0 ? x0 : x1;
    if (Surface.noise(rimX, y, 61) > 0.35) surface.pixel(rimX, y, edgeTone);
  }
}

/**
 * Низкие изометрические бровки/террасы дёрна (шаг 2:1) — дают мягкий рельеф плоскости.
 */
export function drawTerraces(surface, { palette, horizonY, baseX, seed, snowCover, sunDir }) {
  const { width, height } = surface;
  const { land } = palette;
  const spanY = Math.max(1, height - horizonY);
  const riserTone = mixColor(land.ground, land.dark, 0.65);
  const topTone = snowCover > 0.5 ? land.snowLight : mixColor(land.ground, land.light, 0.65);

  const specs = [
    { depth: 0.32, xFrac: 0.72, len: 24, slope: 0.45 },
    { depth: 0.58, xFrac: 0.22, len: 20, slope: -0.45 },
  ];

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const startX = Math.round(spec.xFrac * width + (hash2(i, 5, seed) - 0.5) * 18);
    const startY = Math.round(horizonY + spec.depth * spanY);
    if (Math.abs(startX - baseX) < 18) continue;

    for (let dx = 0; dx < spec.len; dx += 1) {
      const x = startX + dx;
      if (x < 2 || x >= width - 2) continue;
      if (Surface.noise(x, startY, 83) < 0.22) continue;
      const y = Math.round(startY + dx * spec.slope + Math.sin(dx / 4) * 0.6);
      if (y <= horizonY + 2 || y >= height - 2) continue;
      if (Math.abs(x - baseX) < 12) continue;

      surface.pixel(x, y, sunDir > 0 ? topTone : riserTone);
      surface.pixel(x, y + 1, riserTone);
    }
  }
}

function drawRock(surface, x, y, rx, ry, palette, snowCover, sunDir, hazeMix) {
  const light = Math.max(0.14, palette.light);
  const base = mixColor(shade(ROCK_BASE, light), palette.haze, hazeMix);
  const lit = mixColor(shade(ROCK_LIGHT, light), palette.haze, hazeMix);
  const dark = mixColor(shade(ROCK_BASE, light * 0.6), palette.haze, hazeMix);
  const shadow = mixColor(palette.land.ground, SHADOW, 0.42);

  // Направленная 2.5D-тень на земле.
  surface.ellipse(x - sunDir * Math.max(1, Math.round(rx * 0.45)), y + 1, rx, Math.max(1, Math.round(ry * 0.5)), shadow);

  for (let dy = -ry; dy <= 0; dy += 1) {
    for (let dx = -rx; dx <= rx; dx += 1) {
      const dist = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      if (dist > 1 || (dist > 0.82 && Surface.noise(x + dx, y + dy, 37) < 0.4)) continue;

      const color = dy < -ry * 0.4 && dx * sunDir > -1 ? lit : dx * sunDir < -rx * 0.25 ? dark : base;
      surface.pixel(x + dx, y + dy, color);
      if (snowCover > 0.4 && dy <= -ry + 1 && Surface.noise(x + dx, y + dy, 43) < snowCover * 0.7) {
        surface.pixel(x + dx, y + dy, palette.land.snowLight);
      }
    }
  }
}

function drawBush(surface, x, y, rx, ry, palette, foliage, snowCover, sunDir, hazeMix, seed) {
  const light = Math.max(0.15, palette.light);
  const tones = foliage.tones.map((c) => mixColor(shade(c, light), palette.haze, hazeMix));
  const twig = mixColor(shade(BARK_DARK, light), palette.haze, hazeMix);
  const shadow = mixColor(palette.land.ground, SHADOW, 0.42);

  surface.ellipse(x - sunDir * Math.max(1, Math.round(rx * 0.35)), y + 1, rx, Math.max(1, Math.round(ry * 0.45)), shadow);

  for (let dy = -ry; dy <= 0; dy += 1) {
    for (let dx = -rx; dx <= rx; dx += 1) {
      const dist = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      if (dist > 1) continue;
      const px = x + dx;
      const py = y + dy;
      const grain = Surface.noise(px, py, 23 + seed);
      if (dist > 0.78 && grain < 0.4) continue;

      if (foliage.coverage < 0.12) {
        if (grain > 0.54) surface.pixel(px, py, twig);
        if (snowCover > 0.3 && dy <= -ry + 1 && grain < snowCover * 0.7) {
          surface.pixel(px, py, palette.land.snow);
        }
        continue;
      }

      const color = dy < -ry * 0.35 && dx * sunDir >= -1 ? tones[0] : dy > -1 ? tones[2] : tones[1];
      surface.pixel(px, py, color);
      if (snowCover > 0.45 && dy <= -ry + 1 && grain < snowCover * 0.6) {
        surface.pixel(px, py - 1, palette.land.snow);
      }
    }
  }
}

/**
 * Кусты и камни на трёх планах глубины (far, mid, near) с перспективным масштабом.
 */
export function drawPropsByDepth(surface, { palette, foliage, horizonY, baseX, seed, snowCover, sunDir }) {
  const { width, height } = surface;
  const spanY = Math.max(1, height - horizonY);

  const items = [
    { tier: 'far', kind: 'bush', depth: 0.08, xFrac: 0.15, rx: 4, ryRatio: 0.5 },
    { tier: 'far', kind: 'rock', depth: 0.12, xFrac: 0.84, rx: 3, ryRatio: 0.45 },
    { tier: 'mid', kind: 'bush', depth: 0.28, xFrac: 0.64, rx: 6, ryRatio: 0.58 },
    { tier: 'mid', kind: 'bush', depth: 0.42, xFrac: 0.9, rx: 6, ryRatio: 0.6 },
    { tier: 'near', kind: 'rock', depth: 0.74, xFrac: 0.82, rx: 8, ryRatio: 0.5 },
  ];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (width < 240 && item.tier === 'mid' && i === 3) continue;
    const x = Math.round(item.xFrac * width + (hash2(i, 1, seed) - 0.5) * width * 0.08);
    if (Math.abs(x - baseX) < 32 || x < 8 || x > width - 8) continue;

    const y = Math.round(horizonY + item.depth * spanY);
    if (y >= height - 6) continue;

    const rx = item.rx;
    const ry = Math.max(2, Math.round(rx * item.ryRatio));
    const hazeMix = item.tier === 'far' ? 0.32 : item.tier === 'mid' ? 0.1 : 0;

    if (item.kind === 'rock') drawRock(surface, x, y, rx, ry, palette, snowCover, sunDir, hazeMix);
    else drawBush(surface, x, y, rx, ry, palette, foliage, snowCover, sunDir, hazeMix, i);
  }
}
