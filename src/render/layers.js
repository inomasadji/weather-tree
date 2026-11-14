// Кэши тяжёлых слоёв сцены: палитра кадра, небо, ландшафт.
// Вынесено из scene.js, чтобы композитор оставался читаемым и в лимите 300 строк:
// здесь только «что рисовать один раз», а не порядок слоёв.

import { HORIZON_Y, LOGICAL } from '../config.js';
import { Surface } from './surface.js';
import { drawSky } from './sky.js';
import { paintLandscape } from './landscape.js';
import { scenePalette } from '../model/palette.js';

const skyCache = new Map();
const landscapeCache = new Map();
const paletteCache = new Map();

/**
 * Геометрия кадра для произвольного буфера: горизонт, комель и ось ствола.
 * @param {number} width
 * @param {number} height
 * @returns {{horizonY: number, baseX: number, baseY: number}}
 */
export function sceneLayout(width, height) {
  const horizonY = height === LOGICAL.height
    ? HORIZON_Y
    : Math.round(height * (HORIZON_Y / LOGICAL.height));
  const baseX = width === LOGICAL.width
    ? 80
    : width < 260
      ? Math.round(width * 0.5)
      : Math.round(width * 0.25);
  const baseY = height === LOGICAL.height
    ? height - 1
    : Math.min(height - 26, horizonY + Math.max(58, Math.round((height - horizonY) * 0.68)));
  return { horizonY, baseX, baseY };
}

/**
 * Палитра кадра с кэшем: скачок высоты солнца на 0.5° или облачности на 5 %
 * не должен пересобирать палитру и перерисовывать небо.
 * @param {number} altitudeDeg
 * @param {number} cloudPct
 * @param {number} season
 * @param {boolean} storm
 * @param {boolean} neutral
 * @returns {{palette: object, key: string}}
 */
export function paletteFor(altitudeDeg, cloudPct, season, storm, neutral) {
  const key = [
    Math.round(altitudeDeg * 2),
    Math.round(cloudPct / 5),
    Math.round(season * 40),
    storm ? 's' : 'c',
    neutral ? 'n' : 'd',
  ].join('|');

  let palette = paletteCache.get(key);
  if (!palette) {
    palette = scenePalette({ altitudeDeg, cloudPct, seasonPhase: season, storm, neutral });
    paletteCache.set(key, palette);
    if (paletteCache.size > 24) paletteCache.delete(paletteCache.keys().next().value);
  }

  return { palette, key };
}

/**
 * @param {number} width @param {number} height @param {object} palette
 * @param {string} key @param {number} horizonY
 * @returns {Surface}
 */
export function getSkyLayer(width, height, palette, key, horizonY) {
  const cached = skyCache.get(key);
  if (cached) return cached;

  const layer = new Surface(width, height);
  drawSky(layer, palette, horizonY);
  skyCache.set(key, layer);
  if (skyCache.size > 8) skyCache.delete(skyCache.keys().next().value);
  return layer;
}

/**
 * @param {number} width @param {number} height @param {string} key @param {object} options
 * @returns {{layer: Surface, minY: number, maxGroundY: number}}
 */
export function getLandscapeLayer(width, height, key, options) {
  const cached = landscapeCache.get(key);
  if (cached) return cached;

  const layer = new Surface(width, height);
  const bounds = paintLandscape(layer, options);
  const entry = { layer, ...bounds };
  landscapeCache.set(key, entry);
  if (landscapeCache.size > 8) landscapeCache.delete(landscapeCache.keys().next().value);
  return entry;
}

/** Переносит кэшированный ландшафт на сцену: холмы/лес с маской, грунт — одним блоком. */
export function blitLandscape(surface, { layer, minY, maxGroundY }) {
  const { width } = surface;
  const start = minY * width;
  const maskEnd = maxGroundY * width;

  for (let i = start; i < maskEnd; i += 1) {
    const pixel = layer.pixels[i];
    if (pixel !== 0) surface.pixels[i] = pixel;
  }

  if (maxGroundY < surface.height) {
    surface.pixels.set(layer.pixels.subarray(maskEnd), maskEnd);
  }
}

/** Сбрасывает кэши слоёв. */
export function clearLayerCache() {
  skyCache.clear();
  landscapeCache.clear();
  paletteCache.clear();
}
