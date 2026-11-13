// Астрономия сцены: солнце, луна, сумерки, полярный день/ночь.
// Упрощённые формулы NOAA/астрономического альманаха: точности ~0.5° хватает
// для пиксельного кадра, зато нет зависимостей и всё считается за микросекунды.
// Чистый модуль: никакого DOM, импортируется в node --test.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const UNIX_EPOCH_JD = 2_440_587.5;
const J2000 = 2_451_545.0;
const DAY_MS = 86_400_000;

/** Высота центра солнца на восходе с учётом рефракции и радиуса диска. */
export const SUNRISE_ALTITUDE = -0.833;

/** Синодический месяц, сутки. */
const SYNODIC_MONTH = 29.530588853;
/** Известное новолуние: 2000-01-06 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * @param {number} atMs
 * @returns {number} юлианская дата
 */
export function julianDay(atMs) {
  return atMs / DAY_MS + UNIX_EPOCH_JD;
}

/**
 * @param {number} atMs
 * @param {number} lat
 * @param {number} lon
 * @returns {{altitudeDeg: number, azimuthDeg: number, hourAngleDeg: number, declinationDeg: number}}
 */
export function sunPosition(atMs, lat, lon) {
  const n = julianDay(atMs) - J2000;

  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  const siderealDeg =
    18.697374558 * 15 + 24.06570982441908 * 15 * n + lon;
  const localSidereal = ((siderealDeg % 360) + 360) % 360;
  const rawHourAngle = ((localSidereal - rightAscension * DEG) % 360 + 360) % 360;
  const hourAngle = rawHourAngle > 180 ? rawHourAngle - 360 : rawHourAngle;

  const phi = lat * RAD;
  const h = hourAngle * RAD;
  const sinAltitude =
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(h);

  return {
    altitudeDeg: Math.asin(clamp(sinAltitude, -1, 1)) * DEG,
    azimuthDeg:
      (Math.atan2(
        -Math.sin(h),
        Math.tan(declination) * Math.cos(phi) - Math.sin(phi) * Math.cos(h),
      ) *
        DEG +
        360) %
      360,
    hourAngleDeg: hourAngle,
    declinationDeg: declination * DEG,
  };
}

/**
 * Фаза суток по высоте солнца. Границы — из docs/WEATHER-MAPPING.md.
 * @param {number} altitudeDeg
 * @returns {'day'|'golden'|'civil'|'nautical'|'astro'|'night'}
 */
export function daylightPhase(altitudeDeg) {
  if (altitudeDeg > 6) return 'day';
  if (altitudeDeg > SUNRISE_ALTITUDE) return 'golden';
  if (altitudeDeg > -6) return 'civil';
  if (altitudeDeg > -12) return 'nautical';
  if (altitudeDeg > -18) return 'astro';
  return 'night';
}

/**
 * Восход и закат для местных суток: скан по 2 минуты с линейной интерполяцией.
 * Даёт заодно полярный день/ночь без отдельной ветки.
 * @param {number} atMs
 * @param {number} lat
 * @param {number} lon
 * @param {number} [offsetSeconds] смещение пояса точки
 * @returns {{sunrise: number|null, sunset: number|null, polar: 'day'|'night'|null, daylightSeconds: number}}
 */
export function sunriseSunset(atMs, lat, lon, offsetSeconds = 0) {
  const step = 2 * 60_000;
  const localStart =
    Math.floor((atMs + offsetSeconds * 1000) / DAY_MS) * DAY_MS - offsetSeconds * 1000;

  let previousTime = localStart;
  let previous = sunPosition(previousTime, lat, lon).altitudeDeg - SUNRISE_ALTITUDE;
  let sunrise = null;
  let sunset = null;

  for (let time = localStart + step; time <= localStart + DAY_MS; time += step) {
    const current = sunPosition(time, lat, lon).altitudeDeg - SUNRISE_ALTITUDE;

    if (previous < 0 && current >= 0) {
      sunrise = previousTime + (step * -previous) / (current - previous);
    } else if (previous >= 0 && current < 0) {
      sunset = previousTime + (step * previous) / (previous - current);
    }

    previous = current;
    previousTime = time;
  }

  if (sunrise === null && sunset === null) {
    const noon = sunPosition(localStart + DAY_MS / 2, lat, lon).altitudeDeg;
    return { sunrise: null, sunset: null, polar: noon > 0 ? 'day' : 'night', daylightSeconds: 0 };
  }

  return {
    sunrise,
    sunset,
    polar: null,
    daylightSeconds:
      sunrise !== null && sunset !== null ? Math.max(0, sunset - sunrise) / 1000 : 0,
  };
}

/**
 * Фаза луны: 0 — новолуние, 0.5 — полнолуние, 1 — снова новолуние.
 * @param {number} atMs
 * @returns {number} 0…1
 */
export function moonPhase(atMs) {
  const days = (atMs - NEW_MOON_MS) / DAY_MS;
  return ((days / SYNODIC_MONTH) % 1 + 1) % 1;
}

/**
 * Доля освещённого диска: 0 — новолуние, 1 — полнолуние.
 * @param {number} phase
 * @returns {number} 0…1
 */
export function moonIllumination(phase) {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/**
 * Приближённое положение луны: главные возмущения долготы, без широты.
 * @param {number} atMs
 * @param {number} lat
 * @param {number} lon
 * @returns {{altitudeDeg: number, azimuthDeg: number, hourAngleDeg: number}}
 */
export function moonPosition(atMs, lat, lon) {
  const n = julianDay(atMs) - J2000;

  const meanLongitude = 218.316 + 13.176396 * n;
  const meanAnomaly = (134.963 + 13.064993 * n) * RAD;
  const longitude = (meanLongitude + 6.289 * Math.sin(meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;

  const rightAscension = Math.atan2(
    Math.sin(longitude) * Math.cos(obliquity),
    Math.cos(longitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude));

  const siderealDeg = 18.697374558 * 15 + 24.06570982441908 * 15 * n + lon;
  const localSidereal = ((siderealDeg % 360) + 360) % 360;
  const rawHourAngle = ((localSidereal - rightAscension * DEG) % 360 + 360) % 360;
  const hourAngle = rawHourAngle > 180 ? rawHourAngle - 360 : rawHourAngle;

  const phi = lat * RAD;
  const h = hourAngle * RAD;
  const sinAltitude =
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(h);

  return {
    altitudeDeg: Math.asin(clamp(sinAltitude, -1, 1)) * DEG,
    azimuthDeg:
      (Math.atan2(
        -Math.sin(h),
        Math.tan(declination) * Math.cos(phi) - Math.sin(phi) * Math.cos(h),
      ) *
        DEG +
        360) %
      360,
    hourAngleDeg: hourAngle,
  };
}
