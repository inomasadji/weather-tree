// Палитры сцены: шесть опорных состояний суток, между ними — линейный переход
// по высоте солнца. Сезон даёт мягкий цветовой сдвиг, земля — свой набор цветов.
// Чистый модуль: цвет — это uint32 из render/color.js. Сами таблицы — в ./palette/tables.js.

import { hexColor, mixColor } from '../render/color.js';
import { seasonKey, seasonWeights } from './season.js';
import { LAND, NIGHT, PREPARED_KNOTS, SEASON_TINTS, STORM_SKY } from './palette/tables.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const PREPARED = PREPARED_KNOTS;

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
 * @param {{altitudeDeg: number, cloudPct?: number, seasonPhase?: number,
 *          storm?: boolean, neutral?: boolean}} input
 */
export function scenePalette({
  altitudeDeg,
  cloudPct = 0,
  seasonPhase = 0.5,
  storm = false,
  neutral = false,
}) {
  const base = altitudePalette(altitudeDeg);
  const tint = seasonTint(seasonPhase);
  // Гамма: на низком солнце земля темнеет быстрее, чем небо светлеет.
  let light = Math.pow(clamp01((altitudeDeg + 6) / 26), 1.4);

  const land = LAND[seasonKey(seasonPhase)] ?? LAND.summer;
  const clouds = Math.min(1, Math.max(0, (cloudPct ?? 0) / 100));

  // Гроза: небо и облака уходят в свинцово-фиолетовое, земля темнеет.
  const darken = (color) => (storm ? mixColor(color, STORM_SKY, 0.68) : color);
  if (storm) light *= 0.38;

  // Нейтральный кадр (погода ещё не пришла): цвет уходит в серый, солнца нет.
  const grey = shade(hexColor('#8d939c'), light);
  const desaturate = (color) => (neutral ? mixColor(color, grey, 0.55) : color);

  return {
    key: base.key,
    light,
    sky: base.sky.map((color) => darken(desaturate(applyTint(color, tint)))),
    sunCore: base.sunCore,
    sunEdge: base.sunEdge,
    sunHalo: base.sunHalo,
    moonLit: base.moonLit,
    moonShadow: base.moonShadow,
    cloudLight: darken(desaturate(applyTint(base.cloudLight, tint))),
    cloudDark: darken(desaturate(applyTint(base.cloudDark, tint))),
    cloudRim: darken(desaturate(applyTint(base.cloudRim, tint))),
    star: base.star,
    /** Насколько видны звёзды: темнота × прозрачность неба. */
    starOpacity: neutral ? 0 : clamp01((-altitudeDeg - 4) / 10) * (1 - clouds * 0.85),
    haze: applyTint(base.haze, tint),
    land: {
      far: shade(hexColor(land.far), light),
      near: shade(hexColor(land.near), light),
      ground: shade(hexColor(land.ground), light),
      dark: shade(hexColor(land.dark), light),
      light: shade(hexColor(land.light), light),
      snow: shade(hexColor('#dfe9f1'), light),
      snowLight: shade(hexColor('#f4f9fc'), light),
    },
  };
}
