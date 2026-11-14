// Композитор сцены: небо → звёзды → светила → облака → дымка → ландшафт → дерево → осадки.
// Тяжёлые статичные слои (небо, холмы, дальний лес, кусты, земля) кэшируются
// и перерисовываются только при смене палитры, снега, сезона или размера буфера.

import { HORIZON_Y, LOGICAL } from '../config.js';
import { Surface } from './surface.js';
import { drawSky, drawStars, drawMilkyWay } from './sky.js';
import { drawSun, drawMoon, celestialPoint } from './celestial.js';
import { createCloudLayers, drawClouds } from './clouds.js';
import { drawHorizonHaze, paintLandscape } from './landscape.js';
import { scenePalette } from '../model/palette.js';
import { sunPosition, moonPosition, moonPhase } from '../model/sun.js';
import { seasonPhase } from '../model/season.js';
import { foliageState } from '../model/phenology.js';
import { sceneConditions } from '../model/conditions.js';
import { speciesFor, treeSeed } from '../model/species.js';
import { buildTree, drawLeafFall, drawShadow, drawTree } from './tree.js';
import { drawGroundWetness, drawWeather } from './weatherFx.js';
import { dayOfYear, stationDate } from '../model/clock.js';

export const HORIZON = HORIZON_Y;

const skyCache = new Map();
const landscapeCache = new Map();
const paletteCache = new Map();

let cloudLayers = null;
let cloudLayersWidth = 0;
let treeCache = { key: null, tree: null };

/** Освобождает кэши слоёв и геометрии при уходе со страницы. */
export function clearSceneCache() {
  skyCache.clear();
  landscapeCache.clear();
  paletteCache.clear();
  cloudLayers = null;
  cloudLayersWidth = 0;
  treeCache = { key: null, tree: null };
}

/** @param {number} width @param {number} height */
function sceneLayout(width, height) {
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

function paletteFor(altitudeDeg, cloudPct, season, storm, neutral) {
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

function getSkyLayer(width, height, palette, key, horizonY) {
  const cached = skyCache.get(key);
  if (cached) return cached;

  const layer = new Surface(width, height);
  drawSky(layer, palette, horizonY);
  skyCache.set(key, layer);
  if (skyCache.size > 8) skyCache.delete(skyCache.keys().next().value);
  return layer;
}

function getLandscapeLayer(width, height, key, options) {
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
function blitLandscape(surface, { layer, minY, maxGroundY }) {
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

/**
 * Рисует кадр целиком в переданный буфер.
 * @param {Surface} surface
 * @param {object} world WorldState
 * @param {number} [atMs] реальное время кадра (астрономия, палитра)
 * @param {number} [animMs] часы анимации (облака, мерцание)
 */
export function renderScene(surface, world, atMs = Date.now(), animMs = atMs) {
  if (!world || !world.place) return;

  const { width, height } = surface;
  const { horizonY, baseX, baseY } = sceneLayout(width, height);
  const { lat, lon } = world.place;
  const hemisphere = lat >= 0 ? 'N' : 'S';
  const offset = world.now?.utcOffsetSeconds ?? 0;

  const sun = sunPosition(atMs, lat, lon);
  const moon = moonPosition(atMs, lat, lon);
  const phase = moonPhase(atMs);

  const season = seasonPhase(dayOfYear(stationDate(offset, atMs)), hemisphere);
  const known = world.weather?.known !== false;
  const cloudPct = known ? (world.weather?.cloudPct ?? 0) : 55;
  const conditions = sceneConditions(world);
  const { palette, key: paletteKey } = paletteFor(
    sun.altitudeDeg,
    cloudPct,
    season,
    conditions.storm,
    !known,
  );

  const seed = treeSeed(lat, lon);
  const species = speciesFor(lat, seed);
  const foliage = foliageState(season, {
    tempC: world.weather?.tempC ?? 10,
    windKmh: world.weather?.windKmh ?? 0,
    species,
  });

  const sunPoint = known
    ? celestialPoint(surface, sun.hourAngleDeg, sun.altitudeDeg, horizonY)
    : { x: Math.round(surface.width / 2), y: horizonY };
  const sunDir = sunPoint.x >= baseX ? 1 : -1;

  const snowBucket = Math.round(conditions.snowCover * 10);
  const rimeBucket = Math.round(conditions.rime * 10);
  const skyKey = `${paletteKey}:${horizonY}:${width}x${height}`;
  const landKey = `${skyKey}:${snowBucket}:${seed}:${sunDir}:${Math.round(foliage.coverage * 10)}:${rimeBucket}`;

  const sky = getSkyLayer(width, height, palette, skyKey, horizonY);
  surface.pixels.set(sky.pixels);

  if (known) {
    drawMilkyWay(surface, { palette, starOpacity: palette.starOpacity, horizonY });
    drawStars(surface, { palette, starOpacity: palette.starOpacity, timeMs: animMs, horizonY });
    drawSun(surface, { ...sunPoint, palette, altitudeDeg: sun.altitudeDeg });

    const moonPoint = celestialPoint(surface, moon.hourAngleDeg, moon.altitudeDeg, horizonY);
    drawMoon(surface, {
      ...moonPoint,
      palette,
      phase,
      altitudeDeg: moon.altitudeDeg,
      sunAltitudeDeg: sun.altitudeDeg,
    });
  }

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
    fog: conditions.fog,
    horizonY,
  });

  drawHorizonHaze(surface, palette, horizonY);

  const landscape = getLandscapeLayer(width, height, landKey, {
    palette,
    snowCover: conditions.snowCover,
    horizonY,
    baseX,
    seed,
    lat,
    foliage,
    sunDir,
    rime: conditions.rime,
  });
  blitLandscape(surface, landscape);

  drawGroundWetness(surface, conditions, {
    palette,
    timeMs: animMs,
    horizonY,
    windKmh: world.weather?.windKmh ?? 0,
  });

  const treeKey = `${seed}:${species}:${baseX}:${baseY}`;
  if (treeCache.key !== treeKey) {
    treeCache = { key: treeKey, tree: buildTree(seed, { baseX, baseY, species }) };
  }

  drawShadow(surface, treeCache.tree, {
    sunAltitudeDeg: sun.altitudeDeg,
    sunScreenX: sunPoint.x,
    light: palette.light,
    groundColor: conditions.snowCover > 0.5 ? palette.land.snow : palette.land.ground,
    cloudPct,
  });

  drawTree(surface, treeCache.tree, {
    foliage,
    timeMs: animMs,
    windAmp: conditions.windAmp,
    windDirDeg: world.weather?.windDirDeg ?? 0,
    light: palette.light,
    snowLoad: conditions.snowLoad,
    snowColor: palette.land.snow,
    wetness: conditions.wetness,
    rime: conditions.rime,
    rimeColor: palette.rime,
    sunDir: sunPoint.x >= baseX ? 1 : -1,
  });

  drawLeafFall(surface, treeCache.tree, {
    foliage,
    windKmh: world.weather?.windKmh ?? 0,
    timeMs: animMs,
    light: palette.light,
  });

  drawWeather(surface, conditions, {
    timeMs: animMs,
    windKmh: world.weather?.windKmh ?? 0,
    palette,
    horizonY,
  });
}
