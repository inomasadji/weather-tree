// Крона дерева: листва дуба и берёзы с просветами, ярусные лапы хвойного,
// веерные вайи южной породы, цветение, плоды, снежная шапка и листопад.

import { hexColor } from '../color.js';
import { Surface } from '../surface.js';
import { shade } from '../../model/palette.js';
import { hash2 } from '../noise.js';

/**
 * Рваный эллиптический пучок листвы со светом со стороны солнца.
 */
function drawLeafCluster(surface, cluster, offsetX, foliage, light, sunDir, isShadow = false) {
  const scale = 0.48 + foliage.coverage * 0.58;
  const rx = Math.max(1, Math.round((cluster.rx ?? 8) * scale * (isShadow ? 0.75 : 1)));
  const ry = Math.max(1, Math.round((cluster.ry ?? 7) * scale * (isShadow ? 0.75 : 1)));
  const cx = Math.round(cluster.x + offsetX + (isShadow ? -sunDir * 2 : 0));
  const cy = Math.round(cluster.y + (isShadow ? 3 : 0));
  const tones = foliage.tones.map((color) => shade(color, Math.max(0.12, light)));
  const densityCutoff = foliage.species === 'birch' ? 0.72 : 0.84;

  for (let dy = -ry; dy <= ry; dy += 1) {
    for (let dx = -rx; dx <= rx; dx += 1) {
      const dist = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      if (dist > 1) continue;

      const x = cx + dx;
      const y = cy + dy;
      const grain = Surface.noise(x, y, 5);
      if (dist > densityCutoff && grain < (dist - densityCutoff) * 4.5) continue;
      if (foliage.species === 'birch' && grain < 0.14) continue;

      if (isShadow) {
        surface.pixel(x, y, tones[2]);
        continue;
      }

      const lit = dx * sunDir > rx * 0.12 && dy < ry * 0.15;
      const dark = dy > ry * 0.35 || dx * sunDir < -rx * 0.45;
      surface.pixel(x, y, lit ? tones[0] : dark ? tones[2] : tones[1]);

      if (foliage.blossom > 0.08 && grain > 1 - foliage.blossom * 0.14) {
        surface.pixel(x, y, shade(hexColor('#f6dbe6'), Math.max(0.15, light)));
      } else if (foliage.fruit > 0.08 && grain < foliage.fruit * 0.03) {
        surface.pixel(x, y, shade(hexColor('#c0392b'), Math.max(0.15, light)));
      }
    }
  }
}

/**
 * Хвойная «лапа»: ярус ниспадающей хвои со снегом сверху.
 */
function drawConiferBough(surface, cluster, offsetX, foliage, light, sunDir, snowLoad, snowColor) {
  const rx = Math.max(3, Math.round(cluster.rx));
  const ry = Math.max(4, Math.round(cluster.ry));
  const cx = Math.round(cluster.x + offsetX);
  const cy = Math.round(cluster.y);
  const tones = foliage.tones.map((color) => shade(color, Math.max(0.12, light)));

  for (let dy = -2; dy <= ry; dy += 1) {
    const progress = (dy + 2) / (ry + 2);
    const halfW = Math.max(1, Math.round(rx * (0.2 + progress * 0.85)));

    for (let dx = -halfW; dx <= halfW; dx += 1) {
      const edge = Math.abs(dx) / halfW;
      const x = cx + dx;
      const y = cy + dy;
      const grain = Surface.noise(x, y, 19);

      // Зубчатый нижний край и мелкие хвойные кисточки.
      if (progress > 0.72 && grain < (progress - 0.72) * 3.1) continue;
      if (edge > 0.82 && grain < 0.45) continue;

      const lit = dy < ry * 0.32 && dx * sunDir >= -halfW * 0.2;
      const dark = dy > ry * 0.62;
      surface.pixel(x, y, lit ? tones[0] : dark ? tones[2] : tones[1]);

      if (snowLoad > 0.15 && dy <= 1 && grain < snowLoad * 0.75) {
        surface.pixel(x, y - 1, snowColor);
      }
    }
  }
}

/**
 * Веерная ветвь пальмы с перистыми листьями.
 */
function drawPalmFrond(surface, frond, offsetX, drift, foliage, light) {
  const tones = foliage.tones.map((color) => shade(color, Math.max(0.15, light)));
  const steps = Math.round(frond.length);
  const angle = frond.angle + drift * 0.025;
  let prevX = Math.round(frond.x + offsetX);
  let prevY = Math.round(frond.y);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const localAngle = angle - Math.sign(Math.cos(angle) || 1) * t * t * frond.droop;
    const x = Math.round(frond.x + offsetX + Math.cos(localAngle) * step);
    const y = Math.round(frond.y - Math.sin(localAngle) * step + t * t * 9);

    surface.line(prevX, prevY, x, y, tones[1]);
    prevX = x;
    prevY = y;

    const leafLen = Math.round(Math.sin(t * Math.PI) * 7 + 1);
    for (let d = 1; d <= leafLen; d += 1) {
      const tone = d < 3 ? tones[0] : tones[2];
      surface.fillRect(x, y + d, 2, 1, tone);
      if (d <= 2) surface.pixel(x, y - 1, tones[0]);
    }
  }
}

/**
 * Рисует крону целиком с учётом породы и стороны света.
 */
export function drawFoliage(surface, tree, {
  foliage,
  seconds,
  windAmp,
  light,
  snowLoad,
  snowColor,
  sway,
  sunDir = 1,
}) {
  if (foliage.coverage <= 0.02) return;

  if (tree.species === 'conifer') {
    for (const cluster of tree.clusters) {
      const drift = windAmp * 1.6 * Math.sin(seconds * 1.9 + cluster.phase) * cluster.sway;
      drawConiferBough(surface, cluster, sway(cluster.y) + drift, foliage, light, sunDir, snowLoad, snowColor);
    }
    return;
  }

  if (tree.species === 'tropical') {
    for (const frond of tree.fronds) {
      const drift = windAmp * 3.2 * Math.sin(seconds * 2.1 + frond.phase) * frond.sway;
      drawPalmFrond(surface, frond, sway(frond.y), drift, foliage, light);
    }
    return;
  }

  const sorted = [...tree.clusters].sort((a, b) => a.y - b.y);
  // Сначала лёгкие подложки позади пучков (просветы между крупными ветвями сохраняются).
  for (const cluster of sorted) {
    const drift = windAmp * 2.2 * Math.sin(seconds * 2.3 + cluster.phase) * cluster.sway;
    drawLeafCluster(surface, cluster, sway(cluster.y) + drift, foliage, light, sunDir, true);
  }
  for (const cluster of sorted) {
    const drift = windAmp * 2.4 * Math.sin(seconds * 2.3 + cluster.phase) * cluster.sway;
    drawLeafCluster(surface, cluster, sway(cluster.y) + drift, foliage, light, sunDir, false);
  }

  if (snowLoad > 0.45) {
    for (const cluster of tree.clusters) {
      const rx = (cluster.rx ?? 8) * (0.48 + foliage.coverage * 0.58);
      const ry = (cluster.ry ?? 7) * (0.48 + foliage.coverage * 0.58);
      const cx = Math.round(cluster.x + sway(cluster.y));
      const cy = Math.round(cluster.y - ry * 0.6);
      for (let dx = -rx; dx <= rx; dx += 1) {
        const x = cx + dx;
        const dy = Math.round(Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)) * 2.5);
        if (Surface.noise(x, cy, 29) < snowLoad * 0.6) surface.pixel(x, cy - dy, snowColor);
      }
    }
  }
}

/**
 * Листопад: частицы листьев и опад на земле.
 */
export function drawLeafFall(surface, tree, { foliage, windKmh, timeMs, light }) {
  if (tree.species === 'conifer' || tree.species === 'tropical') return;
  const active = foliage.coverage > 0.08 && (foliage.litter > 0.12 || windKmh > 22);
  const litterTone = shade(foliage.tones[1], Math.max(0.2, light));

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
