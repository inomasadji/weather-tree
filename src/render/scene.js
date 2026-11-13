// Композитор сцены: небо → звёзды → светила → облака → дымка → земля.
// Тяжёлые статичные слои (градиент неба, земля с холмами) кэшируются по ключу
// палитры: в кадре остаются только копии буферов и анимируемые слои.

import { HORIZON_Y } from '../config.js';
import { Surface } from './surface.js';
import { drawSky, drawStars, drawMilkyWay } from './sky.js';
import { drawSun, drawMoon, celestialPoint } from './celestial.js';
import { createCloudLayers, drawClouds } from './clouds.js';
import { scenePalette } from '../model/palette.js';
import { sunPosition, moonPosition, moonPhase } from '../model/sun.js';
import { seasonPhase } from '../model/season.js';
import { dayOfYear, stationDate } from '../model/clock.js';
import { bayerThreshold } from './surface.js';

export const HORIZON = HORIZON_Y;

/** С этой строки начинается земля: там слой всегда непрозрачный. */
const GROUND_TOP = HORIZON;

const skyCache = new Map();
const groundCache = new Map();
const paletteCache = new Map();

let cloudLayers = null;
let cloudLayersWidth = 0;

/**
 * Палитра считается не каждый кадр: ключ округляет высоту солнца и сезон.
 * @param {number} altitudeDeg
 * @param {number} cloudPct
 * @param {number} season
 * @returns {{palette: object, key: string}}
 */
function paletteFor(altitudeDeg, cloudPct, season) {
  const key = [
    Math.round(altitudeDeg * 2),
    Math.round(cloudPct / 5),
    Math.round(season * 40),
  ].join('|');

  let palette = paletteCache.get(key);
  if (!palette) {
    palette = scenePalette({ altitudeDeg, cloudPct, seasonPhase: season });
    paletteCache.set(key, palette);
    if (paletteCache.size > 24) paletteCache.delete(paletteCache.keys().next().value);
  }

  return { palette, key };
}

/**
 * Скалистый гребень: две синусоиды дают силуэт без ассетов.
 * @param {Surface} surface
 * @param {{base: number, amplitude: number, period: number, phase: number, color: number, bottom: number}} options
 */
function ridge(surface, { base, amplitude, period, phase, color, bottom }) {
  for (let x = 0; x < surface.width; x += 1) {
    const y = Math.round(
      base +
        Math.sin((x + phase) / period) * amplitude +
        Math.sin((x + phase) / (period / 3.7)) * amplitude * 0.4,
    );
    surface.fillRect(x, y, 1, bottom - y, color);
  }
}

/**
 * Земля и трава в отдельном буфере: перерисовывается только при смене палитры.
 * Холмы рисуются поверх кадра отдельно — они не сплошные и не должны перекрывать небо.
 * @param {Surface} surface
 * @param {object} palette
 */
function paintGround(surface, palette) {
  const { width, height } = surface;
  const { land } = palette;

  surface.fillRect(0, HORIZON, width, height - HORIZON, land.ground);

  // Текстура: детерминированный шум вместо Math.random().
  for (let y = HORIZON + 2; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Surface.noise(x, y, 7);
      if (noise > 0.955) surface.pixel(x, y, land.light);
      else if (noise < 0.045) surface.pixel(x, y, land.dark);
    }
  }

  // Травинки у горизонта — чтобы край не был линейкой.
  for (let index = 0; index < 26; index += 1) {
    const x = Math.round(Surface.noise(index, 1, 31) * width);
    const bladeHeight = 1 + Math.round(Surface.noise(index, 2, 31) * 2);
    surface.fillRect(x, HORIZON - bladeHeight, 1, bladeHeight, land.light);
  }
}

/**
 * @param {number} width
 * @param {number} height
 * @param {object} palette
 * @param {string} key
 * @returns {Surface}
 */
function getSkyLayer(width, height, palette, key) {
  const cached = skyCache.get(key);
  if (cached) return cached;

  const layer = new Surface(width, height);
  drawSky(layer, palette);
  skyCache.set(key, layer);
  if (skyCache.size > 8) skyCache.delete(skyCache.keys().next().value);
  return layer;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {object} palette
 * @param {string} key
 * @returns {Surface}
 */
function getGroundLayer(width, height, palette, key) {
  const cached = groundCache.get(key);
  if (cached) return cached;

  const layer = new Surface(width, height);
  paintGround(layer, palette);
  groundCache.set(key, layer);
  if (groundCache.size > 8) groundCache.delete(groundCache.keys().next().value);
  return layer;
}

/**
 * Рисует кадр целиком в переданный буфер.
 * @param {Surface} surface
 * @param {object} world WorldState (нужны place, weather; now — для HUD)
 * @param {number} [atMs] реальное время кадра (астрономия, палитра)
 * @param {number} [animMs] часы анимации (облака, мерцание)
 */
export function renderScene(surface, world, atMs = Date.now(), animMs = atMs) {
  if (!world || !world.place) return;

  const { width, height } = surface;
  const { lat, lon } = world.place;
  const hemisphere = lat >= 0 ? 'N' : 'S';
  const offset = world.now?.utcOffsetSeconds ?? 0;

  const sun = sunPosition(atMs, lat, lon);
  const moon = moonPosition(atMs, lat, lon);
  const phase = moonPhase(atMs);

  const season = seasonPhase(dayOfYear(stationDate(offset, atMs)), hemisphere);
  const cloudPct = world.weather?.cloudPct ?? 0;
  const { palette, key: paletteKey } = paletteFor(sun.altitudeDeg, cloudPct, season);

  const key = `${paletteKey}:${width}`;

  // Небо (кэш) — копия всего верхнего буфера.
  const sky = getSkyLayer(width, height, palette, key);
  surface.pixels.set(sky.pixels);

  drawMilkyWay(surface, { palette, starOpacity: palette.starOpacity });
  drawStars(surface, { palette, starOpacity: palette.starOpacity, timeMs: animMs });

  const sunPoint = celestialPoint(surface, sun.hourAngleDeg, sun.altitudeDeg);
  drawSun(surface, { ...sunPoint, palette, altitudeDeg: sun.altitudeDeg });

  const moonPoint = celestialPoint(surface, moon.hourAngleDeg, moon.altitudeDeg);
  drawMoon(surface, {
    ...moonPoint,
    palette,
    phase,
    altitudeDeg: moon.altitudeDeg,
    sunAltitudeDeg: sun.altitudeDeg,
  });

  if (cloudLayersWidth !== width) {
    cloudLayers = createCloudLayers(width);
    cloudLayersWidth = width;
  }

  drawClouds(surface, cloudLayers, {
    coverage: cloudPct / 100,
    windKmh: world.weather?.windKmh ?? 0,
    timeMs: animMs,
    palette,
    sunAltitudeDeg: sun.altitudeDeg,
  });

  // Дымка у горизонта поверх облаков — воздух плотнее у земли.
  const haze = palette.haze;
  for (let row = HORIZON - 5; row < HORIZON; row += 1) {
    const density = ((row - (HORIZON - 6)) / 6) * 0.5;
    for (let col = 0; col < width; col += 1) {
      if (bayerThreshold(col, row) < density) surface.pixel(col, row, haze);
    }
  }

  // Холмы — поверх облаков: они ближе. Рисуются каждый кадр, это дёшево.
  ridge(surface, {
    base: 96,
    amplitude: 9,
    period: 46,
    phase: 20,
    color: palette.land.far,
    bottom: 132,
  });
  ridge(surface, {
    base: 106,
    amplitude: 6,
    period: 29,
    phase: 90,
    color: palette.land.near,
    bottom: 134,
  });

  // Земля — из кэша, копируется одним куском.
  const ground = getGroundLayer(width, height, palette, key);
  surface.pixels.set(ground.pixels.subarray(GROUND_TOP * width), GROUND_TOP * width);
}
