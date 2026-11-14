// Таблицы палитр: опорные состояния суток, сезонные сдвиги и цвета земли.
// Здесь только данные — вся логика смешивания живёт в ../palette.js.
// Вынесено отдельным модулем, чтобы palette.js оставался в лимите ~300 строк (AGENTS.md).

import { hexColor } from '../../render/color.js';

/** Цвет глубокой ночи: к нему уводится всё в `shade()`. */
export const NIGHT = hexColor('#0a1024');

/** Свинец грозового неба: к нему подмешиваются небо и облака. */
export const STORM_SKY = hexColor('#2b2740');

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
export const SEASON_TINTS = {
  winter: [0.95, 1.0, 1.09],
  spring: [1.0, 1.04, 1.0],
  summer: [1.06, 1.0, 0.95],
  autumn: [1.08, 0.98, 0.9],
};

/** Земля: свои цвета на каждый сезон; зимой — снег. */
export const LAND = {
  winter: { far: '#93a6b4', near: '#63757f', ground: '#c9d6de', dark: '#aabdc9', light: '#e8f1f6' },
  spring: { far: '#7e9a86', near: '#4c7350', ground: '#3f6b3a', dark: '#2f552e', light: '#568a45' },
  summer: { far: '#6d8f9a', near: '#4a6b5c', ground: '#33503a', dark: '#263c2a', light: '#3f6440' },
  autumn: { far: '#8d8a72', near: '#6a5c40', ground: '#5b4a30', dark: '#463823', light: '#7a5f38' },
};

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

/** @type {Array<object>} опорные состояния в uint32, готовые к смешиванию */
export const PREPARED_KNOTS = KNOTS.map(prepareKnot);
