// Палитры сцены: шесть опорных состояний суток, между ними — линейный переход
// по высоте солнца. Сезон даёт мягкий цветовой сдвиг, земля — свой набор цветов.
// Чистый модуль: цвет — это uint32 из render/color.js.

import { hexColor, mixColor } from '../render/color.js';
import { seasonKey, seasonWeights } from './season.js';

const NIGHT = hexColor('#0a1024');

/** Опорные состояния. altitude — высота солнца в градусах. */
const KNOTS = [
  {
    altitude: -30,
    key: 'night',
    sky: ['#070b1c', '#0a1027', '#0f1734', '#131b38'],
    sunCore: '#f6f9ff',
    sunEdge: '#cfe0ff',
    sunHalo: '#7f96c8',
    moonLit: '#e9f0ff',
    moonShadow: '#0e1630',
    cloudLight: '#1b2440',
    cloudDark: '#121a31',
    cloudRim: '#2b3760',
    star: '#dfe9ff',
    haze: '#1a2444',
  },
  {
    altitude: -15,
    key: 'astro',
    sky: ['#0a1027', '#101a38', '#182348', '#1f2a52'],
    sunCore: '#fdf4ff',
    sunEdge: '#c9d4f4',
    sunHalo: '#7d8cbe',
    moonLit: '#e6edff',
    moonShadow: '#0f1830',
    cloudLight: '#202b4a',
    cloudDark: '#151d36',
    cloudRim: '#33406b',
    star: '#d8e4ff',
    haze: '#243058',
  },
  {
    altitude: -9,
    key: 'nautical',
    sky: ['#122040', '#1b2c52', '#283a66', '#34426e'],
    sunCore: '#ffe9d2',
    sunEdge: '#e8a98c',
    sunHalo: '#a07a8c',
    moonLit: '#e3e9f8',
    moonShadow: '#111b35',
    cloudLight: '#2b3a60',
    cloudDark: '#1d2745',
    cloudRim: '#44507c',
    star: '#cfdcff',
    haze: '#33406b',
  },
  {
    altitude: -3,
    key: 'civil',
    sky: ['#26325a', '#3d4470', '#6f5a74', '#a87a66'],
    sunCore: '#ffe0b0',
    sunEdge: '#f0a86a',
    sunHalo: '#c98b6a',
    moonLit: '#e8e6ef',
    moonShadow: '#1a1c33',
    cloudLight: '#3b4260',
    cloudDark: '#2a3049',
    cloudRim: '#7a6480',
    star: '#b9c8ef',
    haze: '#6a5a78',
  },
  {
    altitude: 3,
    key: 'golden',
    sky: ['#6a7fa8', '#a98a86', '#d9a479', '#f3c98b'],
    sunCore: '#fff6cf',
    sunEdge: '#f7d489',
    sunHalo: '#e9c9a0',
    moonLit: '#f2ead8',
    moonShadow: '#2b2a3a',
    cloudLight: '#d9a184',
    cloudDark: '#8a6675',
    cloudRim: '#ffd0a0',
    star: '#9fb0d8',
    haze: '#c8a98c',
  },
  {
    altitude: 20,
    key: 'day',
    sky: ['#4f86c6', '#8fb6d9', '#b9d7ea', '#cfe3ef'],
    sunCore: '#fff6cf',
    sunEdge: '#f7d489',
    sunHalo: '#efe0b0',
    moonLit: '#f4f1e6',
    moonShadow: '#3a4058',
    cloudLight: '#f2f7fb',
    cloudDark: '#a9c3d8',
    cloudRim: '#ffffff',
    star: '#ffffff',
    haze: '#dfeef8',
  },
];

/** Цветовой сдвиг по сезону: зима холоднее, лето теплее, осень рыжее. */
const SEASON_TINTS = {
  winter: [0.95, 1.0, 1.09],
  spring: [1.0, 1.04, 1.0],
  summer: [1.06, 1.0, 0.95],
  autumn: [1.08, 0.98, 0.9],
};

/** Земля: свои цвета на каждый сезон; зимой — снег. */
const LAND = {
  winter: { far: '#93a6b4', near: '#63757f', ground: '#c9d6de', dark: '#aabdc9', light: '#e8f1f6' },
  spring: { far: '#7e9a86', near: '#4c7350', ground: '#3f6b3a', dark: '#2f552e', light: '#568a45' },
  summer: { far: '#6d8f9a', near: '#4a6b5c', ground: '#33503a', dark: '#263c2a', light: '#3f6440' },
  autumn: { far: '#8d8a72', near: '#6a5c40', ground: '#5b4a30', dark: '#463823', light: '#7a5f38' },
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Цвет полярного состояния → uint32. */
const prepareKnot = (knot) => ({
  ...knot,
  sky: knot.sky.map((hex) => hexColor(hex)),
  sunCore: hexColor(knot.sunCore),
  sunEdge: hexColor(knot.sunEdge),
  sunHalo: hexColor(knot.sunHalo),
  moonLit: hexColor(knot.moonLit),
  moonShadow: hexColor(knot.moonShadow),
  cloudLight: hexColor(knot.cloudLight),
  cloudDark: hexColor(knot.cloudDark),
  cloudRim: hexColor(knot.cloudRim),
  star: hexColor(knot.star),
  haze: hexColor(knot.haze),
});

const PREPARED = KNOTS.map(prepareKnot);

/**
 * Умножение каналов на сезонный сдвиг.
 * @param {number} color
 * @param {[number, number, number]} tint
 * @returns {number}
 */
function applyTint(color, tint) {
  const r = Math.min(255, (color & 255) * tint[0]);
  const g = Math.min(255, ((color >>> 8) & 255) * tint[1]);
  const b = Math.min(255, ((color >>> 16) & 255) * tint[2]);
  return (
    ((color >>> 24) << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)
  ) >>> 0;
}

/**
 * Палитра по высоте солнца, склеенная из двух соседних опорных состояний.
 * @param {number} altitudeDeg
 */
export function altitudePalette(altitudeDeg) {
  const first = PREPARED[0];
  const last = PREPARED[PREPARED.length - 1];

  if (altitudeDeg <= first.altitude) return first;
  if (altitudeDeg >= last.altitude) return last;

  for (let index = 1; index < PREPARED.length; index += 1) {
    const next = PREPARED[index];
    const previous = PREPARED[index - 1];
    if (altitudeDeg <= next.altitude) {
      const t = (altitudeDeg - previous.altitude) / (next.altitude - previous.altitude);
      return blendPalettes(previous, next, t);
    }
  }

  return last;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {number} t
 */
function blendPalettes(a, b, t) {
  const mix = (from, to) => mixColor(from, to, t);

  return {
    key: t < 0.5 ? a.key : b.key,
    altitude: a.altitude + (b.altitude - a.altitude) * t,
    sky: a.sky.map((color, index) => mix(color, b.sky[index])),
    sunCore: mix(a.sunCore, b.sunCore),
    sunEdge: mix(a.sunEdge, b.sunEdge),
    sunHalo: mix(a.sunHalo, b.sunHalo),
    moonLit: mix(a.moonLit, b.moonLit),
    moonShadow: mix(a.moonShadow, b.moonShadow),
    cloudLight: mix(a.cloudLight, b.cloudLight),
    cloudDark: mix(a.cloudDark, b.cloudDark),
    cloudRim: mix(a.cloudRim, b.cloudRim),
    star: mix(a.star, b.star),
    haze: mix(a.haze, b.haze),
  };
}

/**
 * Сезонный сдвиг как взвешенная смесь двух ближайших сезонов.
 * @param {number} phase
 * @returns {[number, number, number]}
 */
export function seasonTint(phase) {
  const weights = seasonWeights(phase);
  const result = [0, 0, 0];

  for (const { key, weight } of weights) {
    const tint = SEASON_TINTS[key] ?? SEASON_TINTS.summer;
    result[0] += tint[0] * weight;
    result[1] += tint[1] * weight;
    result[2] += tint[2] * weight;
  }

  return result;
}

/**
 * Цвет неба в точке t (0 — зенит, 1 — горизонт). Нужен облакам:
 * они подсвечены тем небом, на котором лежат, а не одним цветом на весь кадр.
 * @param {number[]} sky стопы палитры
 * @param {number} t 0…1
 * @returns {number}
 */
export function skyToneAt(sky, t) {
  if (sky.length === 0) return 0;
  if (sky.length === 1) return sky[0];

  const position = clamp01(t) * (sky.length - 1);
  const index = Math.min(sky.length - 2, Math.floor(position));
  return mixColor(sky[index], sky[index + 1], position - index);
}

/**
 * Тёмная версия цвета: ночью всё уходит в синий сумрак.
 * @param {number} color
 * @param {number} light 0…1
 * @returns {number}
 */
export function shade(color, light) {
  return mixColor(mixColor(color, NIGHT, 0.72), color, clamp01(light));
}

/**
 * Полная палитра кадра.
 * @param {{altitudeDeg: number, cloudPct?: number, seasonPhase?: number}} input
 */
export function scenePalette({ altitudeDeg, cloudPct = 0, seasonPhase = 0.5 }) {
  const base = altitudePalette(altitudeDeg);
  const tint = seasonTint(seasonPhase);
  // Гамма: на низком солнце земля темнеет быстрее, чем небо светлеет.
  const light = Math.pow(clamp01((altitudeDeg + 6) / 26), 1.4);

  const land = LAND[seasonKey(seasonPhase)] ?? LAND.summer;
  const clouds = Math.min(1, Math.max(0, (cloudPct ?? 0) / 100));

  return {
    key: base.key,
    light,
    sky: base.sky.map((color) => applyTint(color, tint)),
    sunCore: base.sunCore,
    sunEdge: base.sunEdge,
    sunHalo: base.sunHalo,
    moonLit: base.moonLit,
    moonShadow: base.moonShadow,
    cloudLight: applyTint(base.cloudLight, tint),
    cloudDark: applyTint(base.cloudDark, tint),
    cloudRim: applyTint(base.cloudRim, tint),
    star: base.star,
    /** Насколько видны звёзды: темнота × прозрачность неба. */
    starOpacity: clamp01((-altitudeDeg - 4) / 10) * (1 - clouds * 0.85),
    haze: applyTint(base.haze, tint),
    land: {
      far: shade(hexColor(land.far), light),
      near: shade(hexColor(land.near), light),
      ground: shade(hexColor(land.ground), light),
      dark: shade(hexColor(land.dark), light),
      light: shade(hexColor(land.light), light),
    },
  };
}
