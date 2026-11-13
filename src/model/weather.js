// Коды WMO → человеческий текст и мелкие форматтеры.
// Чистые функции: импортируются в node --test без DOM.

/** Коды с осадками в жидкой фазе — при морозе превращаются в мокрый снег. */
const RAIN_CODES = {
  light: new Set([51, 56, 61, 66, 80]),
  moderate: new Set([53, 63, 81]),
  heavy: new Set([55, 57, 65, 67, 82]),
};

const DESCRIPTIONS = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',
  51: 'Слабая морось',
  53: 'Морось',
  55: 'Сильная морось',
  56: 'Слабая ледяная морось',
  57: 'Ледяная морось',
  61: 'Небольшой дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Небольшой ледяной дождь',
  67: 'Ледяной дождь',
  71: 'Небольшой снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежная крупа',
  80: 'Небольшой ливень',
  81: 'Ливень',
  82: 'Сильный ливень',
  85: 'Небольшой снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с небольшим градом',
  99: 'Гроза с градом',
};

const FROZEN_RAIN = {
  light: 'Небольшой мокрый снег',
  moderate: 'Мокрый снег',
  heavy: 'Сильный мокрый снег',
};

/**
 * Описание погоды по коду WMO с поправкой на температуру:
 * дождь при −5 °C называется мокрым снегом, а не дождём.
 * @param {number} code
 * @param {number} [tempC]
 * @returns {string}
 */
export function describeWeather(code, tempC) {
  const base = DESCRIPTIONS[code];
  if (!base) return 'Погода без описания';

  const frozen = typeof tempC === 'number' && tempC <= 1.5;
  if (!frozen) return base;

  for (const [intensity, codes] of Object.entries(RAIN_CODES)) {
    if (codes.has(code)) return FROZEN_RAIN[intensity];
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

const CARDINALS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

/**
 * Градусы → румб (8 направлений, где дует ветер).
 * @param {number} deg
 * @returns {string}
 */
export function windCardinal(deg) {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return '—';
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[index];
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
 * Ветер в вид «28 км/ч ЮЗ».
 * @param {number} kmh
 * @param {number} [deg]
 * @returns {string}
 */
export function formatWind(kmh, deg) {
  if (typeof kmh !== 'number' || !Number.isFinite(kmh)) return '—';
  const speed = `${Math.round(kmh)} км/ч`;
  return deg === undefined ? speed : `${speed} ${windCardinal(deg)}`;
}
