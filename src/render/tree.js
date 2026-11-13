// Дерево: процедурный скелет, листва по сезону, снег на ветвях, тень и качание.
// Геометрия строится один раз из сида (широта/долгота), поэтому у каждого города
// своё дерево, а между перезагрузками — одно и то же.

import { hexColor, mixColor } from './color.js';
import { Surface, bayerThreshold } from './surface.js';
import { shade } from '../model/palette.js';

const BARK = hexColor('#4a3626');
const BARK_LIGHT = hexColor('#63492f');
const SHADOW = hexColor('#0d1526');

/**
 * Детерминированный ГПСЧ: mulberry32.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Сид дерева из координат: близкие точки дают похожие, далёкие — разные.
 * @param {number} lat
 * @param {number} lon
 * @returns {number}
 */
export function treeSeed(lat, lon) {
  return Math.round((lat * 1000 + lon * 7) * 31 + 17) | 0;
}

/**
 * @param {number} seed
 * @returns {{segments: Array<object>, clusters: Array<object>, baseX: number, baseY: number}}
 */
export function buildTree(seed) {
  const random = mulberry32(seed);
  const segments = [];
  const clusters = [];
  const baseX = 80;
  const baseY = 179;

  /**
   * @param {number} x @param {number} y
   * @param {number} angle радианы, π/2 — вверх
   * @param {number} length @param {number} width @param {number} depth
   */
  function grow(x, y, angle, length, width, depth) {
    const x2 = x + Math.cos(angle) * length;
    const y2 = y - Math.sin(angle) * length;
    segments.push({ x1: x, y1: y, x2, y2, width, depth });

    if (depth === 0) {
      clusters.push({ x: x2, y: y2, radius: 8 + random() * 5, depth });
      return;
    }

    // Крона должна быть плотной, поэтому кластеры ставятся и в середине ветвей.
    // Ниже развилки листва не растёт — иначе зелёные шапки на голом стволе.
    if (depth <= 2 && y2 < 130) {
      clusters.push({
        x: (x + x2) / 2 + (random() - 0.5) * 4,
        y: (y + y2) / 2 + (random() - 0.5) * 4,
        radius: 7 + random() * 4,
        depth,
      });
    }

    // Верхние ветви ветвятся охотнее — крона получается шире.
    const forks = depth >= 3 ? 2 : random() < 0.55 ? 2 : 3;
    for (let index = 0; index < forks; index += 1) {
      const spread = (index - (forks - 1) / 2) * (0.55 + random() * 0.3);
      const childAngle = angle + spread * (0.85 + random() * 0.35);
      grow(
        x2,
        y2,
        childAngle,
        length * (0.66 + random() * 0.14),
        Math.max(1, width * 0.62),
        depth - 1,
      );
    }
  }

  // Корневой наплыв: пара коротких веток у самой земли.
  grow(baseX, baseY, Math.PI / 2, 46, 9, 4);
  segments.push({ x1: baseX - 2, y1: baseY, x2: baseX - 7, y2: baseY - 5, width: 2, depth: 4 });
  segments.push({ x1: baseX + 2, y1: baseY, x2: baseX + 7, y2: baseY - 5, width: 2, depth: 4 });

  return { segments, clusters, baseX, baseY };
}

/**
 * Толстая линия: круги вдоль отрезка. Так ветви выглядят «мясисто», а не как нитки.
 * @param {Surface} surface
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {number} width @param {number} color
 */
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
 * Тень на земле: смещение и длина зависят от солнца, плотность — от его высоты.
 * @param {Surface} surface
 * @param {object} tree
 * @param {{sunAltitudeDeg: number, hourAngleDeg: number, light: number, groundColor: number}} options
 */
export function drawShadow(surface, tree, {
  sunAltitudeDeg,
  hourAngleDeg,
  light,
  groundColor,
  cloudPct = 0,
}) {
  if (sunAltitudeDeg < 2 || light < 0.05) return;

  const altitude = Math.max(6, sunAltitudeDeg);
  // Чем ниже солнце, тем длиннее тень; направление — противоположно солнцу.
  const length = Math.min(52, 18 / Math.tan((altitude * Math.PI) / 180));
  const direction = hourAngleDeg > 0 ? -1 : 1;
  const cx = tree.baseX + direction * length * 0.5;
  const rx = 14 + length * 0.55;
  const ry = 4 + length * 0.06;
  // Пасмурное небо даёт рассеянный свет — тень почти исчезает.
  const density = Math.min(0.5, 0.12 + (90 - altitude) / 260) * (1 - (cloudPct / 100) * 0.85);
  if (density < 0.02) return;

  const color = mixColor(groundColor, SHADOW, 0.55);

  for (let y = Math.round(tree.baseY - ry - 2); y <= tree.baseY + 2; y += 1) {
    for (let x = Math.round(cx - rx); x <= cx + rx; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - tree.baseY) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (bayerThreshold(x, y) < density) surface.pixel(x, y, color);
    }
  }
}

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

      if (foliage.blossom > 0.08 && grain > 1 - foliage.blossom * 0.28) {
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
  const rx = (maxX - minX) / 2 * 0.78 + 6;
  const ry = (maxY - minY) / 2 * 0.85 + 6;
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
 * Рисует дерево целиком.
 * @param {Surface} surface
 * @param {object} tree
 * @param {{
 *   foliage: object, timeMs: number, windAmp: number, windDirDeg: number,
 *   light: number, snowLoad: number, snowColor: number, wetness: number
 * }} options
 */
export function drawTree(surface, tree, {
  foliage,
  timeMs,
  windAmp,
  windDirDeg,
  light,
  snowLoad,
  snowColor,
  wetness,
}) {
  const radians = ((windDirDeg ?? 0) * Math.PI) / 180;
  const lean = -Math.sin(radians) * windAmp * 6;
  const seconds = timeMs / 1000;

  const sway = (y) => {
    const height = Math.max(0, tree.baseY - y);
    const factor = (height / 120) ** 1.7;
    return (
      lean * factor +
      windAmp * factor * 13 * Math.sin(seconds * 1.05 + y * 0.021) +
      windAmp * factor * 4 * Math.sin(seconds * 3.1 + y * 0.09)
    );
  };

  const bark = shade(BARK, Math.max(0.1, light));
  const barkLight = shade(BARK_LIGHT, Math.max(0.1, light));

  // Ствол и ветви.
  for (const segment of tree.segments) {
    drawBranch(
      surface,
      segment.x1 + sway(segment.y1),
      segment.y1,
      segment.x2 + sway(segment.y2),
      segment.y2,
      segment.width,
      segment.depth <= 1 ? barkLight : bark,
    );
  }

  // Влага: мокрые ветви темнее, с бликом по северной стороне.
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

  // Снег на ветвях — только на горизонтальных участках и тонких ветках.
  if (snowLoad > 0.05) {
    for (const segment of tree.segments) {
      if (segment.y1 > tree.baseY - 8) continue;
      const steps = Math.max(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1), 1);

      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = Math.round(segment.x1 + (segment.x2 - segment.x1) * t + sway(segment.y1));
        const y = Math.round(segment.y1 + (segment.y2 - segment.y1) * t);
        if (Surface.noise(x, y, 17) < snowLoad * 0.55) {
          surface.pixel(x, y - 1, snowColor);
          if (segment.width > 3 && Surface.noise(x, y, 23) < snowLoad * 0.5) {
            surface.pixel(x, y - 2, snowColor);
          }
        }
      }
    }
  }

  // Крона.
  if (foliage.coverage > 0.02) {
    drawCrownBase(surface, tree, foliage, light, sway);

    const sorted = [...tree.clusters].sort((a, b) => a.y - b.y);
    for (const cluster of sorted) {
      drawCluster(surface, cluster, sway(cluster.y), foliage, light);
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
}
