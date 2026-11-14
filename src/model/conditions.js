// Погода → физические параметры сцены: тип осадков, снег на земле и ветвях,
// влажность, туман, гроза, амплитуда качания. Чистый модуль, тестируется в Node.
// Правила соответствуют docs/WEATHER-MAPPING.md.

import { isPrecipitation } from './weather.js';

/** Снежные коды WMO. */
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
/** Морось. */
const DRIZZLE = new Set([51, 53, 55]);
/** Ледяные осадки: дождь/морось, замерзающие у земли. */
const FREEZING = new Set([56, 57, 66, 67]);
/** Ливни. */
const SHOWERS = new Set([80, 81, 82]);
/** Грозы. */
const STORM = new Set([95, 96, 99]);
/** Туман. */
const FOG = new Set([45, 48]);

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Тип и интенсивность осадков с поправкой на температуру.
 * @param {number} code код WMO
 * @param {number} tempC
 * @returns {{type: 'none'|'rain'|'drizzle'|'snow'|'grains'|'hail', intensity: number,
 *            freezing: boolean, storm: boolean}}
 */
export function classifyPrecipitation(code, tempC) {
  const dry = { type: 'none', intensity: 0, freezing: false, storm: false };
  if (!isPrecipitation(code)) return dry;

  const storm = STORM.has(code);
  const freezing = FREEZING.has(code);

  // Интенсивность: коды внутри группы идут по возрастанию.
  let intensity = 0.5;
  if ([51, 56, 61, 66, 71, 80, 85].includes(code)) intensity = 0.3;
  else if ([53, 63, 73, 81, 95].includes(code)) intensity = 0.6;
  else if ([55, 57, 65, 67, 75, 82, 86, 96, 99].includes(code)) intensity = 0.9;

  if (storm) return { type: 'rain', intensity: 0.85, freezing: false, storm: true };

  if (SNOW.has(code)) {
    // Тёплый снег — это мокрый снег с дождём, но рисуем всё равно снегом.
    return { type: code === 77 ? 'grains' : 'snow', intensity, freezing, storm: false };
  }

  if (FREEZING.has(code)) {
    // Ледяные осадки при морозе — снежная крупа, иначе дождь.
    return { type: tempC <= 1.5 ? 'snow' : 'rain', intensity, freezing: true, storm: false };
  }

  if (DRIZZLE.has(code)) return { type: 'drizzle', intensity, freezing: false, storm: false };
  if (SHOWERS.has(code)) return { type: 'rain', intensity, freezing: false, storm: false };

  return { type: 'rain', intensity, freezing: false, storm: false };
}

/**
 * Амплитуда качания дерева по ветру (0…1) — из таблицы в WEATHER-MAPPING.
 * @param {number} windKmh
 * @param {number} [gustKmh]
 * @returns {number}
 */
export function windAmplitude(windKmh, gustKmh = 0) {
  const speed = Math.max(windKmh ?? 0, (gustKmh ?? 0) * 0.8);
  if (speed <= 6) return 0.03;
  if (speed <= 20) return 0.03 + 0.27 * ((speed - 6) / 14);
  if (speed <= 35) return 0.3 + 0.25 * ((speed - 20) / 15);
  if (speed <= 55) return 0.55 + 0.3 * ((speed - 35) / 20);
  return Math.min(1, 0.85 + 0.15 * Math.min(1, (speed - 55) / 25));
}

/**
 * Полный набор физических параметров кадра.
 * @param {object} world WorldState
 * @returns {object}
 */
export function sceneConditions(world) {
  const weather = world.weather ?? {};
  const precip = classifyPrecipitation(weather.code ?? 0, weather.tempC ?? 10);
  const intensity = precip.intensity;
  const snowing = precip.type === 'snow' || precip.type === 'grains';
  const tempC = weather.tempC ?? 10;

  // Высота покрова: если провайдер отдаёт snow_depth (метры) — верим ему.
  // 30 см считаем полным покровом. Иначе — прежняя эвристика (wttr.in).
  const depth =
    typeof weather.snowDepthM === 'number' && Number.isFinite(weather.snowDepthM)
      ? Math.max(0, weather.snowDepthM)
      : null;

  let snowCover;
  if (depth !== null) {
    snowCover = clamp01(depth / 0.3);
    // Свежий снег виден сразу, даже если модель ещё не обновила высоту.
    if (snowing) snowCover = Math.max(snowCover, 0.4 + intensity * 0.45);
    // На жаре остатки не держатся.
    if (tempC > 5) snowCover *= 0.5;
    if (tempC > 12) snowCover = 0;
  } else if (snowing) {
    snowCover = 0.45 + intensity * 0.55;
  } else if (tempC < -2) {
    snowCover = 0.5;
  } else if (tempC < 0) {
    snowCover = 0.2;
  } else {
    snowCover = 0;
  }

  // На ветвях снег держится слабее, чем на земле.
  const snowLoad = snowing
    ? clamp01(0.25 + intensity * 0.65)
    : snowCover > 0.55
      ? 0.18
      : 0;

  const wetness = precip.type === 'rain' || precip.type === 'drizzle' ? intensity : 0;
  const fog = FOG.has(weather.code ?? 0)
    ? 0.65 + ((weather.code ?? 0) === 48 ? 0.15 : 0)
    : clamp01(((weather.humidity ?? 0) - 92) / 40) * 0.5;

  return {
    precip,
    snowing,
    snowCover: clamp01(snowCover),
    snowLoad,
    wetness,
    fog,
    storm: precip.storm,
    windAmp: windAmplitude(weather.windKmh ?? 0, weather.gustKmh ?? 0),
    /** Туман и ливень «съедают» дальний план. */
    haze: clamp01(fog * 0.8 + (precip.type === 'rain' ? intensity * 0.35 : 0)),
  };
}
