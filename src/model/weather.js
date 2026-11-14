// Коды WMO → человеческий текст и мелкие форматтеры.
// Чистые функции: импортируются в node --test без DOM.

import { dict } from './i18n.js';

/** Коды с осадками в жидкой фазе — при морозе превращаются в мокрый снег. */
const RAIN_CODES = {
  light: new Set([51, 56, 61, 66, 80]),
  moderate: new Set([53, 63, 81]),
  heavy: new Set([55, 57, 65, 67, 82]),
};

/**
 * Описание погоды по коду WMO с поправкой на температуру:
 * дождь при −5 °C называется мокрым снегом, а не дождём.
 * @param {number} code
 * @param {number} [tempC]
 * @param {string} [lang]
 * @returns {string}
 */
export function describeWeather(code, tempC, lang = 'ru') {
  const strings = dict(lang);
  const base = strings.weather[code];
  if (!base) return strings.unknownWeather;

  const frozen = typeof tempC === 'number' && tempC <= 1.5;
  if (!frozen) return base;

  for (const [intensity, codes] of Object.entries(RAIN_CODES)) {
    if (codes.has(code)) return strings.frozenRain[intensity];
  }
  return base;
}

/** Есть ли в коде осадки вообще (для визуальных слоёв в M5). */
export function isPrecipitation(code) {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 77) ||
    (code >= 80 && code <= 86) ||
    (code >= 95 && code <= 99)
  );
}

/**
 * Градусы → румб (8 направлений, где дует ветер).
 * @param {number} deg
 * @param {string} [lang]
 * @returns {string}
 */
export function windCardinal(deg, lang = 'ru') {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return '—';
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dict(lang).cardinals[index];
}

/**
 * Температура в вид «+24°», «−11°», «0°».
 * @param {number} tempC
 * @returns {string}
 */
export function formatTemp(tempC) {
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) return '—';
  const rounded = Math.round(tempC);
  if (rounded > 0) return `+${rounded}°`;
  if (rounded < 0) return `−${Math.abs(rounded)}°`;
  return '0°';
}

/**
 * Ветер в вид «28 км/ч ЮЗ» или «28 km/h SW».
 * @param {number} kmh
 * @param {number} [deg]
 * @param {string} [lang]
 * @returns {string}
 */
export function formatWind(kmh, deg, lang = 'ru') {
  if (typeof kmh !== 'number' || !Number.isFinite(kmh)) return '—';
  const speed = `${Math.round(kmh)} ${dict(lang).windUnit}`;
  return deg === undefined ? speed : `${speed} ${windCardinal(deg, lang)}`;
}
