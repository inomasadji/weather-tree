// Второй провайдер: wttr.in (WorldWeatherOnline под капотом).
// Нужен как фолбэк: api.open-meteo.com недоступен из некоторых сетей.
// Ключа нет, CORS открыт, данные отдаются по координатам.

import { WTTR } from '../config.js';
import { offsetSecondsFor } from '../model/clock.js';
import { fetchJson } from './http.js';

/** Коды WWO → коды WMO, чтобы остальные слои знали только один словарь. */
const WWO_TO_WMO = new Map([
  [113, 0], // Sunny / Clear
  [116, 2], // Partly cloudy
  [119, 3], // Cloudy
  [122, 3], // Overcast
  [143, 45], // Mist
  [176, 80], // Patchy rain possible
  [179, 85], // Patchy snow possible
  [182, 66], // Patchy sleet possible
  [185, 56], // Patchy freezing drizzle
  [200, 95], // Thundery outbreaks possible
  [227, 75], // Blowing snow
  [230, 75], // Blizzard
  [248, 45], // Fog
  [260, 48], // Freezing fog
  [263, 51], // Patchy light drizzle
  [266, 51], // Light drizzle
  [281, 56], // Freezing drizzle
  [284, 57], // Heavy freezing drizzle
  [293, 61], // Patchy light rain
  [296, 61], // Light rain
  [299, 63], // Moderate rain at times
  [302, 63], // Moderate rain
  [305, 65], // Heavy rain at times
  [308, 65], // Heavy rain
  [311, 66], // Light freezing rain
  [314, 67], // Moderate/heavy freezing rain
  [317, 66], // Light sleet
  [320, 67], // Moderate/heavy sleet
  [323, 71], // Patchy light snow
  [326, 71], // Light snow
  [329, 73], // Patchy moderate snow
  [332, 73], // Moderate snow
  [335, 75], // Patchy heavy snow
  [338, 75], // Heavy snow
  [350, 77], // Ice pellets
  [353, 80], // Light rain shower
  [356, 81], // Moderate/heavy rain shower
  [359, 82], // Torrential rain shower
  [362, 66], // Light sleet showers
  [365, 67], // Moderate/heavy sleet showers
  [368, 85], // Light snow showers
  [371, 86], // Moderate/heavy snow showers
  [374, 77], // Light showers of ice pellets
  [377, 77], // Moderate/heavy showers of ice pellets
  [386, 95], // Patchy light rain with thunder
  [389, 95], // Moderate/heavy rain with thunder
  [392, 95], // Patchy light snow with thunder
  [395, 95], // Moderate/heavy snow with thunder
]);

/**
 * @param {number|string} wwo
 * @returns {number} код WMO, либо -1 для неизвестного
 */
export function mapWwoCode(wwo) {
  return WWO_TO_WMO.get(Number(wwo)) ?? -1;
}

/**
 * @param {{lat: number, lon: number}} place
 * @returns {string}
 */
export function buildWttrUrl(place) {
  return `${WTTR.baseUrl}/${place.lat.toFixed(2)},${place.lon.toFixed(2)}?format=j1`;
}

/**
 * «07:03 AM» + «2026-11-13» → «2026-11-13T07:03» (местное время без смещения).
 * @param {string|null} date
 * @param {string|null|undefined} time
 * @returns {string|null}
 */
export function localIso(date, time) {
  if (!date || !time) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return null;

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;

  return `${date}T${String(hours).padStart(2, '0')}:${match[2]}`;
}

const minutesOfIso = (iso) => {
  if (!iso) return null;
  const hours = Number(iso.slice(11, 13));
  const minutes = Number(iso.slice(14, 16));
  return hours * 60 + minutes;
};

/**
 * День/ночь по местному времени и восходу/закату. У wttr.in нет флага is_day.
 * @returns {boolean}
 */
export function computeIsDay(offsetSeconds, atMs, sunriseIso, sunsetIso) {
  const date = new Date(atMs + offsetSeconds * 1000);
  const localMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const sunrise = minutesOfIso(sunriseIso);
  const sunset = minutesOfIso(sunsetIso);

  if (sunrise === null || sunset === null) return localMinutes >= 6 * 60 && localMinutes < 18 * 60;
  return localMinutes >= sunrise && localMinutes < sunset;
}

/**
 * @param {any} json
 * @param {object} place
 * @param {number} [fetchedAt]
 * @returns {object|null} Station в том же формате, что у openMeteo.js
 */
export function normalizeWttr(json, place, fetchedAt = Date.now()) {
  const current = json?.current_condition?.[0];
  if (!current) return null;

  const tempC = Number(current.temp_C);
  if (!Number.isFinite(tempC)) return null;

  const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const offset = offsetSecondsFor(place.timeZone, fetchedAt);
  const day = json.weather?.[0] ?? {};
  const astronomy = day.astronomy?.[0] ?? {};
  const date = typeof day.date === 'string' ? day.date : null;

  const sunrise = localIso(date, astronomy.sunrise);
  const sunset = localIso(date, astronomy.sunset);
  const sunriseMinutes = minutesOfIso(sunrise);
  const sunsetMinutes = minutesOfIso(sunset);

  return {
    provider: 'wttr.in',
    place: {
      name: place.name,
      country: place.country ?? '',
      lat: num(place.lat),
      lon: num(place.lon),
    },
    timezone: place.timeZone ?? 'UTC',
    utcOffsetSeconds: offset,
    observedAt: null,
    fetchedAt,
    current: {
      tempC,
      feelsC: num(current.FeelsLikeC, tempC),
      humidity: num(current.humidity),
      code: mapWwoCode(current.weatherCode),
      cloudPct: num(current.cloudcover),
      precipMm: num(current.precipMM),
      pressureHpa: Math.round(num(current.pressure, 1013)),
      windKmh: num(current.windspeedKmph),
      windDirDeg: num(current.winddirDegree),
      // Порывов wttr обычно не отдаёт — не выдумываем: ровно скорость ветра.
      gustKmh: num(current.windgustKmph, num(current.windspeedKmph)),
      isDay: computeIsDay(offset, fetchedAt, sunrise, sunset),
    },
    daily: {
      sunrise,
      sunset,
      daylightSeconds:
        sunriseMinutes !== null && sunsetMinutes !== null && sunsetMinutes > sunriseMinutes
          ? (sunsetMinutes - sunriseMinutes) * 60
          : null,
    },
  };
}

/**
 * @param {object} place
 * @returns {Promise<{ok: true, station: object} | {ok: false, reason: string}>}
 */
export async function fetchStation(place) {
  const result = await fetchJson(buildWttrUrl(place), {
    timeoutMs: WTTR.timeoutMs,
    retries: WTTR.retries,
  });

  if (!result.ok) return result;

  const station = normalizeWttr(result.data, place);
  if (!station) return { ok: false, reason: 'shape' };

  return { ok: true, station };
}
