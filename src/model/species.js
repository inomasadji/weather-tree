// Породы деревьев и лесистость по широте (без ручного выбора пользователем).
// Детерминированный выбор по широте и сиду координат: у каждого города
// своя стабильная порода, подходящая его климатическому поясу.

import { hexColor } from '../render/color.js';

/**
 * Сид дерева из координат: близкие точки дают похожие, далёкие — разные.
 * @param {number} lat
 * @param {number} lon
 * @returns {number}
 */
export function treeSeed(lat, lon) {
  return Math.round((lat * 1000 + lon * 7) * 31 + 17) | 0;
}

export const SPECIES_META = {
  conifer: {
    id: 'conifer',
    evergreen: true,
    bark: [hexColor('#4d3626'), hexColor('#634733')],
    barkSpots: null,
  },
  birch: {
    id: 'birch',
    evergreen: false,
    bark: [hexColor('#d6d4cb'), hexColor('#b3b0a6')],
    barkSpots: hexColor('#2d2723'),
  },
  oak: {
    id: 'oak',
    evergreen: false,
    bark: [hexColor('#4a3626'), hexColor('#63492f')],
    barkSpots: null,
  },
  tropical: {
    id: 'tropical',
    evergreen: true,
    bark: [hexColor('#614834'), hexColor('#7a5d44')],
    barkSpots: hexColor('#423022'),
  },
};

/**
 * Детерминированное число 0…1 из сида координат.
 * @param {number} seed
 * @param {number} [salt]
 * @returns {number}
 */
function seedRoll(seed, salt = 0) {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4_294_967_296;
}

/**
 * Выбирает породу дерева по широте и сиду точки.
 * Пороги подобраны так, чтобы умеренные широты получали дуб/берёзу/хвойное,
 * север — ель/берёзу, тропики — южную породу.
 * @param {number} lat широта −90…90
 * @param {number} [seed]
 * @returns {'conifer'|'birch'|'oak'|'tropical'}
 */
export function speciesFor(lat, seed = 0) {
  if (!Number.isFinite(lat)) return 'oak';
  const abs = Math.abs(lat);
  const roll = seedRoll(seed, 1);

  if (abs >= 62) return roll < 0.72 ? 'conifer' : 'birch';
  if (abs >= 53) {
    if (roll < 0.45) return 'oak';
    if (roll < 0.78) return 'birch';
    return 'conifer';
  }
  if (abs >= 34) {
    if (roll < 0.55) return 'oak';
    if (roll < 0.82) return 'birch';
    return 'conifer';
  }
  if (abs >= 24) {
    if (roll < 0.58) return 'tropical';
    if (roll < 0.88) return 'oak';
    return 'conifer';
  }
  return 'tropical';
}

/**
 * Плотность дальнего леса (0…1) в зависимости от широты и сида точки.
 * Максимум — в умеренно-бореальных широтах (42°…64°), минимум — в Арктике.
 * @param {number} lat
 * @param {number} [seed]
 * @returns {number}
 */
export function forestDensity(lat, seed = 0) {
  if (!Number.isFinite(lat)) return 0.6;
  const abs = Math.abs(lat);
  const jitter = (seedRoll(seed, 2) - 0.5) * 0.2;

  let base;
  if (abs >= 70) base = 0.08;
  else if (abs >= 64) base = 0.35;
  else if (abs >= 42) base = 0.8;
  else if (abs >= 26) base = 0.52;
  else base = 0.62;

  return Math.max(0.05, Math.min(0.95, base + jitter));
}
