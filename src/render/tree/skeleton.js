// Скелет дерева: генерация ствола/ветвей из сида координат, тень на земле,
// отрисовка коры, влаги и снежного покрова на ветвях.

import { hexColor, mixColor } from '../color.js';
import { Surface, bayerThreshold } from '../surface.js';
import { shade } from '../../model/palette.js';

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
 * Строит геометрию ствола, ветвей и точек крепления кроны.
 * @param {number} seed
 * @param {{baseX?: number, baseY?: number}} [anchor]
 * @returns {{segments: Array<object>, clusters: Array<object>, baseX: number, baseY: number}}
 */
export function buildTree(seed, { baseX = 80, baseY = 179 } = {}) {
  const random = mulberry32(seed);
  const segments = [];
  const clusters = [];

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
      clusters.push({
        x: x2,
        y: y2,
        radius: 8 + random() * 5,
        depth,
        phase: random() * Math.PI * 2,
        sway: 0.6 + random() * 0.8,
      });
      return;
    }

    // Крона должна быть плотной, поэтому кластеры ставятся и в середине ветвей.
    // Ниже развилки листва не растёт — иначе зелёные шапки на голом стволе.
    if (depth <= 2 && y2 < baseY - 49) {
      clusters.push({
        x: (x + x2) / 2 + (random() - 0.5) * 4,
        y: (y + y2) / 2 + (random() - 0.5) * 4,
        radius: 7 + random() * 4,
        depth,
        phase: random() * Math.PI * 2,
        sway: 0.55 + random() * 0.9,
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
 * @param {{sunAltitudeDeg: number, sunScreenX: number, light: number,
 *          groundColor: number, cloudPct?: number}} options
 */
export function drawShadow(surface, tree, {
  sunAltitudeDeg,
  sunScreenX,
  light,
  groundColor,
  cloudPct = 0,
}) {
  if (sunAltitudeDeg < 2 || light < 0.05) return;

  const altitude = Math.max(6, sunAltitudeDeg);
  // Чем ниже солнце, тем длиннее тень. Сторона противоположна светилу на экране,
  // поэтому азимут и полушарие учитываются сами собой.
  const length = Math.min(52, 18 / Math.tan((altitude * Math.PI) / 180));
  const direction = sunScreenX < tree.baseX ? 1 : -1;
  const cx = tree.baseX + direction * length * 0.55;
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
 * Рисует ствол, ветви, влажный блеск и снег на ветвях.
 * @param {Surface} surface
 * @param {object} tree
 * @param {{sway: (y: number) => number, light: number, snowLoad: number,
 *          snowColor: number, wetness: number}} options
 */
export function drawSkeleton(surface, tree, { sway, light, snowLoad, snowColor, wetness }) {
  const bark = shade(BARK, Math.max(0.1, light));
  const barkLight = shade(BARK_LIGHT, Math.max(0.1, light));

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
}
