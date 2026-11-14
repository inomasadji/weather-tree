// Скелет дерева: отрисовка ствола и ветвей, тень на земле, фактура коры, влага и снег.

import { hexColor, mixColor } from '../color.js';
import { Surface, bayerThreshold } from '../surface.js';
import { shade } from '../../model/palette.js';
import { SPECIES_META, treeSeed } from '../../model/species.js';
import { buildTree } from './builders.js';

export { buildTree, treeSeed };

const SHADOW = hexColor('#0d1526');
const COCONUT = hexColor('#4a311e');

function drawBranch(surface, x1, y1, x2, y2, width, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  const radius = Math.max(0, Math.round(width / 2));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    if (radius === 0) surface.pixel(x, y, color);
    else surface.circle(x, y, radius, color);
  }
}

/**
 * 2.5D-тень на земле: смещение по горизонтали и глубине от положения и высоты солнца.
 */
export function drawShadow(surface, tree, { sunAltitudeDeg, sunScreenX, light, groundColor, cloudPct = 0 }) {
  if (sunAltitudeDeg < 2 || light < 0.05) return;

  const altitude = Math.max(6, sunAltitudeDeg);
  const length = Math.min(52, 18 / Math.tan((altitude * Math.PI) / 180));
  const direction = sunScreenX < tree.baseX ? 1 : -1;
  // Чем ближе солнце к центру неба, тем сильнее тень уходит вперёд по 2.5D-плоскости.
  const central = Math.max(0, 1 - Math.abs(sunScreenX - tree.baseX) / (surface.width * 0.45));
  const skewY = Math.round(central * 3);
  const cx = tree.baseX + direction * length * 0.55;
  const cy = Math.min(surface.height - 2, tree.baseY + skewY);
  const rx = 14 + length * 0.55;
  const ry = 4 + length * 0.06 + central * 2;
  const density = Math.min(0.5, 0.12 + (90 - altitude) / 260) * (1 - (cloudPct / 100) * 0.85);
  if (density < 0.02) return;

  const color = mixColor(groundColor, SHADOW, 0.55);

  for (let y = Math.round(cy - ry - 2); y <= Math.min(surface.height - 1, cy + 2); y += 1) {
    const isoShift = (y - tree.baseY) * direction * 0.6;
    for (let x = Math.round(cx - rx + isoShift); x <= cx + rx + isoShift; x += 1) {
      const dx = (x - cx - isoShift) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (bayerThreshold(x, y) < density) surface.pixel(x, y, color);
    }
  }
}

/**
 * Рисует ствол, ветви, 2.5D-основание корней, фактуру коры, влагу, иней и снег на ветвях.
 */
export function drawSkeleton(surface, tree, {
  sway,
  light,
  snowLoad,
  snowColor,
  wetness,
  rime = 0,
  rimeColor = 0,
}) {
  const meta = SPECIES_META[tree.species] ?? SPECIES_META.oak;
  const bark = shade(meta.bark[0], Math.max(0.1, light));
  const barkLight = shade(meta.bark[1], Math.max(0.1, light));
  const spotColor = meta.barkSpots ? shade(meta.barkSpots, Math.max(0.12, light)) : null;

  // Контактная тень под основанием ствола и 2.5D-корни по диагоналям 2:1.
  const rootShadow = shade(hexColor('#1b241d'), Math.max(0.15, light));
  surface.ellipse(tree.baseX, tree.baseY, 7, 2, rootShadow);
  for (let step = 0; step < 5; step += 1) {
    const dy = Math.floor(step / 2);
    surface.pixel(tree.baseX - 3 - step, tree.baseY - 2 + dy, bark);
    surface.pixel(tree.baseX + 3 + step, tree.baseY - 2 + dy, bark);
  }

  for (const segment of tree.segments) {
    const x1 = segment.x1 + sway(segment.y1);
    const x2 = segment.x2 + sway(segment.y2);
    drawBranch(surface, x1, segment.y1, x2, segment.y2, segment.width, segment.depth <= 1 ? barkLight : bark);

    if (spotColor && segment.width >= 3) {
      const midY = Math.round((segment.y1 + segment.y2) / 2);
      const midX = Math.round((x1 + x2) / 2);
      surface.fillRect(midX - 1, midY, 2, 1, spotColor);
      if (tree.species === 'birch' && segment.width >= 4) {
        surface.fillRect(Math.round(x1), Math.round(segment.y1 - 3), 2, 1, spotColor);
      }
    }
  }

  if (tree.crown) {
    const cx = Math.round(tree.crown.x + sway(tree.crown.y));
    const cy = Math.round(tree.crown.y + 3);
    const nut = shade(COCONUT, Math.max(0.15, light));
    surface.circle(cx - 2, cy, 2, nut);
    surface.circle(cx + 2, cy + 1, 2, nut);
  }

  if (wetness > 0.05) {
    for (const segment of tree.segments) {
      if (segment.width > 4) continue;
      const x = Math.round(segment.x2 + sway(segment.y2));
      const y = Math.round(segment.y2);
      if (Surface.noise(x, y, 13) < wetness * 0.35) {
        surface.pixel(x, y + 1, shade(hexColor('#2b2118'), Math.max(0.1, light)));
      }
    }
  }

  // Иней: кристаллический налёт на тонких ветвях, только по освещённой кромке.
  if (rime > 0.05) {
    for (const segment of tree.segments) {
      if (segment.width > 3.5) continue;
      const steps = Math.max(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1), 1);
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = Math.round(segment.x1 + (segment.x2 - segment.x1) * t + sway(segment.y1));
        const y = Math.round(segment.y1 + (segment.y2 - segment.y1) * t);
        if (Surface.noise(x, y, 23) < rime * 0.5) surface.pixel(x, y - 1, rimeColor);
      }
    }
  }

  const effectiveSnow = tree.species === 'tropical' ? Math.max(0, snowLoad - 0.35) : snowLoad;
  if (effectiveSnow > 0.05) {
    for (const segment of tree.segments) {
      if (segment.y1 > tree.baseY - 8) continue;
      const steps = Math.max(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1), 1);
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = Math.round(segment.x1 + (segment.x2 - segment.x1) * t + sway(segment.y1));
        const y = Math.round(segment.y1 + (segment.y2 - segment.y1) * t);
        if (Surface.noise(x, y, 17) < effectiveSnow * 0.55) {
          surface.pixel(x, y - 1, snowColor);
        }
      }
    }
  }
}
