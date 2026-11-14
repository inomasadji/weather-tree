// Текстовое описание кадра — для скринридеров и для aria-label сцены.
// Чистая функция: WorldState → короткая фраза.

import { foliageState } from './phenology.js';
import { sceneConditions } from './conditions.js';
import { describeWeather } from './weather.js';
import { dict } from './i18n.js';
import { speciesFor } from './species.js';
import { treeSeed } from './species.js';

/**
 * @param {object} world WorldState
 * @param {string} [lang]
 * @returns {string}
 */
export function describeScene(world, lang = 'ru') {
  const d = dict(lang).describe;
  if (!world || !world.weather) return d.fallback;
  if (world.weather.known === false) return d.loading;

  const conditions = sceneConditions(world);
  const season = world.derived?.season ?? 0.5;
  const lat = world.place?.lat;
  const lon = world.place?.lon;
  const species = Number.isFinite(lat) && Number.isFinite(lon)
    ? speciesFor(lat, treeSeed(lat, lon))
    : 'oak';
  const foliage = foliageState(season, {
    tempC: world.weather.tempC,
    windKmh: world.weather.windKmh,
    species,
  });

  const parts = [];
  parts.push(world.derived?.isDay ? d.day : d.night);
  parts.push(describeWeather(world.weather.code, world.weather.tempC, lang).toLowerCase());

  if (conditions.snowing) parts.push(d.snowing);
  else if (conditions.precip.type === 'rain') parts.push(d.rain);
  if (conditions.fog > 0.4) parts.push(d.fog);
  if (conditions.storm) parts.push(d.storm);

  if (Number.isFinite(lat) && d.species[species]) parts.push(d.species[species]);

  if (foliage.stage === 'evergreen') parts.push(d.evergreen);
  else if (foliage.stage === 'bare') parts.push(d.bare);
  else if (foliage.stage === 'blossom') parts.push(d.blossom);
  else if (foliage.stage === 'young') parts.push(d.young);
  else parts.push(d.leafy);

  if (conditions.snowLoad > 0.4) parts.push(d.snowBranches);
  if (world.weather.windKmh >= 20) parts.push(d.wind(Math.round(world.weather.windKmh)));

  return `${d.prefix}: ${parts.join(', ')}`;
}
