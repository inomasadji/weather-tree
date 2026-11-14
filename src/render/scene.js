// Композитор сцены: небо → звёзды → светила → облака → дымка → ландшафт → дерево → осадки.
// Тяжёлые статичные слои (небо, холмы, дальний лес, кусты, земля) кэшируются
// и перерисовываются только при смене палитры, снега, сезона или размера буфера.

import { HORIZON_Y, LOGICAL } from '../config.js';
import { drawStars, drawMilkyWay } from './sky.js';
import { drawSun, drawMoon, celestialPoint } from './celestial.js';
import { createCloudLayers, drawClouds } from './clouds.js';
import { drawHorizonHaze, drawNearForeground } from './landscape.js';
import {
  blitLandscape,
  clearLayerCache,
  getLandscapeLayer,
  getSkyLayer,
  paletteFor,
  sceneLayout,
} from './layers.js';
import { sunPosition, moonPosition, moonPhase } from '../model/sun.js';
import { seasonPhase } from '../model/season.js';
import { foliageState } from '../model/phenology.js';
import { sceneConditions } from '../model/conditions.js';
import { speciesFor, treeSeed } from '../model/species.js';
import { buildTree, drawLeafFall, drawShadow, drawTree } from './tree.js';
import { drawGroundWetness, drawWeather, drawFireflies } from './weatherFx.js';
import { drawBirds } from './birds.js';
import { dayOfYear, stationDate } from '../model/clock.js';

export const HORIZON = HORIZON_Y;

let cloudLayers = null;
let cloudLayersWidth = 0;
let treeCache = { key: null, tree: null };

/** Освобождает кэши слоёв и геометрии при уходе со страницы. */
export function clearSceneCache() {
  clearLayerCache();
  cloudLayers = null;
  cloudLayersWidth = 0;
  treeCache = { key: null, tree: null };
}

/**
 * Рисует кадр целиком в переданный буфер.
 * @param {Surface} surface
 * @param {object} world WorldState
 * @param {number} [atMs] реальное время кадра (астрономия, палитра)
 * @param {number} [animMs] часы анимации (облака, мерцание)
 * @param {{x: number, y: number}} [view] сдвиг камеры −1…1: дальний план уходит
 *   в одну сторону, ближняя трава — в другую (параллакс)
 */
export function renderScene(surface, world, atMs = Date.now(), animMs = atMs, view = { x: 0, y: 0 }) {
  if (!world || !world.place) return;

  const { width, height } = surface;
  const { horizonY, baseX, baseY } = sceneLayout(width, height);
  const { lat, lon } = world.place;
  const hemisphere = lat >= 0 ? 'N' : 'S';
  const offset = world.now?.utcOffsetSeconds ?? 0;

  // Параллакс: небо уходит против движения камеры, ближняя трава — по движению.
  const zoom = width / LOGICAL.width;
  const farX = -Math.round((view?.x ?? 0) * 2.4 * zoom);
  const farY = -Math.round((view?.y ?? 0) * 1.2 * zoom);
  const nearX = Math.round((view?.x ?? 0) * 1.6 * zoom);
  const nearY = Math.round((view?.y ?? 0) * 0.8 * zoom);

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
    drawMilkyWay(surface, { palette, starOpacity: palette.starOpacity, horizonY, shiftX: farX, shiftY: farY });
    drawStars(surface, {
      palette,
      starOpacity: palette.starOpacity,
      timeMs: animMs,
      horizonY,
      shiftX: farX,
      shiftY: farY,
    });
    drawSun(surface, {
      ...sunPoint,
      x: sunPoint.x + farX,
      y: sunPoint.y + farY,
      palette,
      altitudeDeg: sun.altitudeDeg,
    });

    const moonPoint = celestialPoint(surface, moon.hourAngleDeg, moon.altitudeDeg, horizonY);
    drawMoon(surface, {
      ...moonPoint,
      x: moonPoint.x + farX,
      y: moonPoint.y + farY,
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
    shiftX: farX,
    shiftY: farY,
  });

  drawHorizonHaze(surface, palette, horizonY);

  // Птицы: только днём, без осадков и тумана, не в глухую зиму.
  if (
    known &&
    palette.starOpacity <= 0.02 &&
    conditions.precip.type === 'none' &&
    conditions.fog < 0.3 &&
    cloudPct < 85 &&
    (world.weather?.windKmh ?? 0) < 35 &&
    season > 0.14 &&
    season < 0.86
  ) {
    drawBirds(surface, { timeMs: animMs, palette, shiftX: farX, shiftY: farY });
  }

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

  // Ближний план: тёмная трава и валуны у кромки — перекрывают дерево и дают глубину.
  drawNearForeground(surface, {
    palette,
    windAmp: conditions.windAmp,
    timeMs: animMs,
    seed,
    baseX,
    snowCover: conditions.snowCover,
    viewX: nearX,
    viewY: nearY,
  });

  // Светлячки: тёплый сезон, тёмная тихая ночь без осадков и тумана.
  const fireflyNight =
    known &&
    season > 0.34 &&
    season < 0.7 &&
    conditions.precip.type === 'none' &&
    conditions.fog < 0.25 &&
    palette.starOpacity > 0.3 &&
    (world.weather?.windKmh ?? 0) < 20;

  if (fireflyNight) {
    drawFireflies(surface, {
      timeMs: animMs,
      palette,
      horizonY,
      baseY,
      density: Math.min(1, palette.starOpacity),
    });
  }

  drawWeather(surface, conditions, {
    timeMs: animMs,
    windKmh: world.weather?.windKmh ?? 0,
    palette,
    horizonY,
  });
}
