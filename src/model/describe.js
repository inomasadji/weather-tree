// Текстовое описание кадра — для скринридеров и для aria-label сцены.
// Чистая функция: WorldState → короткая фраза по-русски.

import { foliageState } from './phenology.js';
import { sceneConditions } from './conditions.js';
import { describeWeather } from './weather.js';

/**
 * @param {object} world WorldState
 * @returns {string}
 */
export function describeScene(world) {
  if (!world || !world.weather) return 'Погодная сцена с деревом';
  if (world.weather.known === false) return 'Пиксельная сцена: погода загружается';

  const conditions = sceneConditions(world);
  const season = world.derived?.season ?? 0.5;
  const foliage = foliageState(season, {
    tempC: world.weather.tempC,
    windKmh: world.weather.windKmh,
  });

  const parts = [];
  parts.push(world.derived?.isDay ? 'день' : 'ночь');
  parts.push(describeWeather(world.weather.code, world.weather.tempC).toLowerCase());

  if (conditions.snowing) parts.push('снегопад');
  else if (conditions.precip.type === 'rain') parts.push('дождь');
  if (conditions.fog > 0.4) parts.push('туман');
  if (conditions.storm) parts.push('гроза');

  if (foliage.stage === 'bare') parts.push('дерево без листвы');
  else if (foliage.stage === 'blossom') parts.push('дерево в цвету');
  else if (foliage.stage === 'young') parts.push('молодая листва');
  else parts.push('дерево в листве');

  if (conditions.snowLoad > 0.4) parts.push('ветки в снегу');
  if (world.weather.windKmh >= 20) parts.push(`ветер ${Math.round(world.weather.windKmh)} км/ч`);

  return `Пиксельная сцена: ${parts.join(', ')}`;
}
