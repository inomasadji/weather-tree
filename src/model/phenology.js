// Фенология кроны: время года → плотность листвы, цветение, плоды, опад.
// Непрерывная кривая по фазе сезона (0 — зимнее солнцестояние, 0.5 — летнее).
// Чистый модуль: цвета — uint32, импортируется в node --test.

import { hexColor, mixColor } from '../render/color.js';

/**
 * Опорные точки года. `tones` — [светлый, средний, тёмный] оттенки листвы.
 * Цвета для голых веток не используются, но нужны интерполятору.
 */
const KEYFRAMES = [
  {
    at: 0,
    coverage: 0,
    blossom: 0,
    fruit: 0,
    litter: 0.08,
    tones: ['#7d6a4f', '#5f5138', '#463a29'],
  },
  {
    at: 0.12,
    coverage: 0,
    blossom: 0,
    fruit: 0,
    litter: 0.05,
    tones: ['#8a7752', '#6b5c3c', '#4c4029'],
  },
  {
    at: 0.26,
    coverage: 0.28,
    blossom: 0.6,
    fruit: 0,
    litter: 0.02,
    tones: ['#b6dd7a', '#8cc355', '#63a03f'],
  },
  {
    at: 0.4,
    coverage: 0.88,
    blossom: 0.22,
    fruit: 0,
    litter: 0,
    tones: ['#8ccb62', '#5aa84a', '#3d8040'],
  },
  {
    at: 0.5,
    coverage: 1,
    blossom: 0,
    fruit: 0.05,
    litter: 0,
    tones: ['#63b04e', '#3d8639', '#2a602e'],
  },
  {
    at: 0.6,
    coverage: 1,
    blossom: 0,
    fruit: 0.12,
    litter: 0,
    tones: ['#67b352', '#3f8a3d', '#2b6330'],
  },
  {
    at: 0.72,
    coverage: 1,
    blossom: 0,
    fruit: 0.34,
    litter: 0,
    tones: ['#7ba648', '#4f8a3a', '#356b30'],
  },
  {
    at: 0.82,
    coverage: 0.92,
    blossom: 0,
    fruit: 0.16,
    litter: 0.06,
    tones: ['#c2b23e', '#9c9a34', '#6f7a2c'],
  },
  {
    at: 0.9,
    coverage: 0.55,
    blossom: 0,
    fruit: 0,
    litter: 0.28,
    tones: ['#e0a83f', '#c07a2b', '#94482a'],
  },
  {
    at: 0.96,
    coverage: 0.12,
    blossom: 0,
    fruit: 0,
    litter: 0.5,
    tones: ['#b56a3f', '#8f4a2e', '#6b3a26'],
  },
  {
    at: 1,
    coverage: 0,
    blossom: 0,
    fruit: 0,
    litter: 0.18,
    tones: ['#7d6a4f', '#5f5138', '#463a29'],
  },
];

const PREPARED = KEYFRAMES.map((frame) => ({
  ...frame,
  tones: frame.tones.map((hex) => hexColor(hex)),
}));

const CONIFER_TONES = ['#4c8549', '#2f5d34', '#1d3c23'].map((hex) => hexColor(hex));
const TROPICAL_TONES = ['#74bf4b', '#499338', '#2a5f26'].map((hex) => hexColor(hex));
const BIRCH_AUTUMN = ['#f2cb46', '#d99b26', '#9e661c'].map((hex) => hexColor(hex));

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {number} seasonPhase 0…1
 * @param {{tempC?: number, windKmh?: number, species?: string}} [options]
 * @returns {{coverage: number, blossom: number, fruit: number, litter: number,
 *            tones: number[], stage: string, species: string}}
 */
export function foliageState(seasonPhase, { tempC = 8, windKmh = 0, species = 'oak' } = {}) {
  const phase = ((seasonPhase % 1) + 1) % 1;

  if (species === 'conifer') {
    return {
      coverage: 0.94,
      blossom: 0,
      fruit: 0,
      litter: 0,
      tones: CONIFER_TONES,
      stage: 'evergreen',
      species,
    };
  }

  if (species === 'tropical') {
    const fruit = phase > 0.35 && phase < 0.75 ? 0.14 : 0.04;
    return {
      coverage: 0.92,
      blossom: phase > 0.18 && phase < 0.35 ? 0.25 : 0,
      fruit,
      litter: 0,
      tones: TROPICAL_TONES,
      stage: 'evergreen',
      species,
    };
  }

  let from = PREPARED[0];
  let to = PREPARED[1];

  for (let index = 1; index < PREPARED.length; index += 1) {
    if (phase <= PREPARED[index].at) {
      from = PREPARED[index - 1];
      to = PREPARED[index];
      break;
    }
    from = PREPARED[index];
    to = PREPARED[PREPARED.length - 1];
  }

  const span = to.at - from.at || 1;
  const t = Math.min(1, Math.max(0, (phase - from.at) / span));

  let coverage = lerp(from.coverage, to.coverage, t);
  const blossom = species === 'birch' ? 0 : lerp(from.blossom, to.blossom, t);
  const fruit = species === 'birch' ? 0 : lerp(from.fruit, to.fruit, t);
  const litter = lerp(from.litter, to.litter, t);

  // Ветер срывает листву быстрее, ранние заморозки — тем более.
  if (coverage > 0.05) {
    const windLoss = Math.min(0.16, Math.max(0, windKmh - 25) * 0.004);
    const frostLoss = tempC < -4 ? 0.08 : 0;
    coverage = Math.max(0, coverage - windLoss - frostLoss);
  }

  let tones = from.tones.map((color, index) => mixColor(color, to.tones[index], t));
  if (species === 'birch' && phase > 0.76 && phase < 0.96) {
    const goldWeight = Math.sin(((phase - 0.76) / 0.2) * Math.PI);
    tones = tones.map((color, index) => mixColor(color, BIRCH_AUTUMN[index], goldWeight * 0.8));
  }

  return { coverage, blossom, fruit, litter, tones, stage: stageOf(coverage, blossom), species };
}

/**
 * @param {number} coverage
 * @param {number} blossom
 * @returns {string}
 */
function stageOf(coverage, blossom) {
  if (blossom > 0.35) return 'blossom';
  if (coverage < 0.05) return 'bare';
  if (coverage < 0.4) return 'young';
  if (coverage < 0.8) return 'growing';
  return 'full';
}
