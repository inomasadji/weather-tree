// Крона дерева: листва по сезону, цветение, плоды, снежная шапка и листопад.

import { hexColor } from '../color.js';
import { Surface } from '../surface.js';
import { shade } from '../../model/palette.js';
import { hash2 } from '../noise.js';

/**
 * Крона: кластеры листвы с рваным краем и тремя тонами.
 * @param {Surface} surface
 * @param {object} cluster
 * @param {number} offsetX
 * @param {object} foliage
 * @param {number} light
 */
function drawCluster(surface, cluster, offsetX, foliage, light) {
  const radius = Math.max(1, Math.round(cluster.radius * (0.45 + foliage.coverage * 0.6)));
  const cx = Math.round(cluster.x + offsetX);
  const cy = Math.round(cluster.y);
  const tones = foliage.tones.map((color) => shade(color, Math.max(0.12, light)));

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      if (distance > 1) continue;

      // Край рваный: чем дальше от центра, тем больше пропусков.
      const grain = Surface.noise(cx + dx, cy + dy, 5);
      if (distance > 0.85 && grain < (distance - 0.85) * 4.5) continue;

      const x = cx + dx;
      const y = cy + dy;
      const lit = dx < -radius * 0.15 && dy < radius * 0.1;
      const dark = dy > radius * 0.35;
      const tone = lit ? tones[0] : dark ? tones[2] : tones[1];

      surface.pixel(x, y, tone);

      if (foliage.blossom > 0.08 && grain > 1 - foliage.blossom * 0.14) {
        surface.pixel(x, y, shade(hexColor('#f6dbe6'), Math.max(0.15, light)));
      } else if (foliage.fruit > 0.08 && grain < foliage.fruit * 0.03) {
        surface.pixel(x, y, shade(hexColor('#c0392b'), Math.max(0.15, light)));
      }
    }
  }
}

/**
 * Подложка кроны: большая мягкая масса под кластерами, чтобы между ними
 * не просвечивало небо. Рисуется тёмным тоном — кластеры дают фактуру сверху.
 * @param {Surface} surface
 * @param {object} tree
 * @param {object} foliage
 * @param {number} light
 * @param {(y: number) => number} sway
 */
function drawCrownBase(surface, tree, foliage, light, sway) {
  if (tree.clusters.length === 0) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const cluster of tree.clusters) {
    minX = Math.min(minX, cluster.x);
    maxX = Math.max(maxX, cluster.x);
    minY = Math.min(minY, cluster.y);
    maxY = Math.max(maxY, cluster.y);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 + 4;
  const rx = ((maxX - minX) / 2) * 0.78 + 6;
  const ry = ((maxY - minY) / 2) * 0.85 + 6;
  const tone = shade(foliage.tones[2], Math.max(0.1, light * 0.92));
  const offset = sway(cy);

  for (let y = Math.round(cy - ry); y <= cy + ry; y += 1) {
    for (let x = Math.round(cx - rx + offset); x <= cx + rx + offset; x += 1) {
      const dx = (x - offset - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (dx * dx + dy * dy > 0.86 && Surface.noise(x, y, 31) < 0.35) continue;
      surface.pixel(x, y, tone);
    }
  }
}

/**
 * Рисует крону целиком: подложку, кластеры с независимой фазой и снежную шапку.
 * @param {Surface} surface
 * @param {object} tree
 * @param {{foliage: object, seconds: number, windAmp: number, light: number,
 *          snowLoad: number, snowColor: number, sway: (y: number) => number}} options
 */
export function drawFoliage(surface, tree, {
  foliage,
  seconds,
  windAmp,
  light,
  snowLoad,
  snowColor,
  sway,
}) {
  if (foliage.coverage <= 0.02) return;

  drawCrownBase(surface, tree, foliage, light, sway);

  const sorted = [...tree.clusters].sort((a, b) => a.y - b.y);
  for (const cluster of sorted) {
    // Каждый кластер «дышит» в своей фазе — крона не двигается монолитом.
    const drift =
      windAmp * 2.4 * Math.sin(seconds * 2.3 + (cluster.phase ?? 0)) * (cluster.sway ?? 1);
    drawCluster(surface, cluster, sway(cluster.y) + drift, foliage, light);
  }

  // Снежная шапка сверху кроны.
  if (snowLoad > 0.45) {
    for (const cluster of tree.clusters) {
      const radius = cluster.radius * (0.45 + foliage.coverage * 0.6);
      const cx = Math.round(cluster.x + sway(cluster.y));
      const cy = Math.round(cluster.y - radius * 0.55);
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = cx + dx;
        const dy = Math.round(Math.sqrt(Math.max(0, radius * radius - dx * dx)) * 0.35);
        if (Surface.noise(x, cy, 29) < snowLoad * 0.6) {
          surface.pixel(x, cy - dy, snowColor);
        }
      }
    }
  }
}

/**
 * Листопад: частицы листьев и опад на земле. Позиция — функция времени,
 * поэтому кадр детерминирован и не «дёргается» между перерисовками.
 * @param {Surface} surface
 * @param {object} tree
 * @param {{foliage: object, windKmh: number, timeMs: number, light: number}} options
 */
export function drawLeafFall(surface, tree, { foliage, windKmh, timeMs, light }) {
  const active = foliage.coverage > 0.08 && (foliage.litter > 0.12 || windKmh > 22);
  const litterTone = shade(foliage.tones[1], Math.max(0.2, light));

  // Опад на земле — есть почти всегда, когда листва редеет.
  if (foliage.litter > 0.06) {
    for (let dx = -48; dx <= 48; dx += 1) {
      const x = tree.baseX + dx;
      const noise = Surface.noise(x, tree.baseY, 43);
      if (noise < foliage.litter * 0.4) {
        surface.pixel(x, tree.baseY - 3 - Math.round(noise * 9), litterTone);
      }
    }
  }

  if (!active) return;

  const crown = tree.clusters.reduce(
    (bounds, cluster) => ({
      minX: Math.min(bounds.minX, cluster.x),
      maxX: Math.max(bounds.maxX, cluster.x),
      minY: Math.min(bounds.minY, cluster.y),
      maxY: Math.max(bounds.maxY, cluster.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  if (!Number.isFinite(crown.minX)) return;

  const count = Math.min(24, Math.round(6 + foliage.litter * 26 + (windKmh > 22 ? 8 : 0)));
  const seconds = timeMs / 1000;

  for (let index = 0; index < count; index += 1) {
    const seedX = crown.minX + hash2(index, 1, 37) * (crown.maxX - crown.minX);
    const seedY = crown.minY + hash2(index, 2, 37) * (crown.maxY - crown.minY);
    const fall = 11 + hash2(index, 3, 37) * 15;
    const life = 4 + hash2(index, 4, 37) * 4;
    const age = (seconds * (0.6 + windKmh / 60) + index * 1.37) % life;

    const x = seedX + age * (1.2 + windKmh * 0.22) + Math.sin(age * 2.4 + index) * 3;
    const y = seedY + age * fall;

    if (y < crown.maxY - 6 || y > tree.baseY - 2 || x < 0 || x > surface.width) continue;

    surface.pixel(Math.round(x), Math.round(y), shade(foliage.tones[index % 3], Math.max(0.25, light)));
  }
}
