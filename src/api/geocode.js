// Местоположение: поиск города, обратное геокодирование точки, IP-fallback.
// Всё — бесплатные открытые API без ключей.

import { GEOCODE } from '../config.js';
import { fetchJson } from './http.js';

const round = (value) => Math.round(value * 100) / 100;

/** Пояс устройства — лучшее приближение для координат, полученных от геолокации. */
function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Поиск города по названию (Open-Meteo Geocoding).
 * @param {string} query
 * @returns {Promise<{ok: true, items: Array<object>} | {ok: false, reason: string}>}
 */
export async function searchPlaces(query, language = GEOCODE.language) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, items: [] };

  const params = new URLSearchParams({
    name: trimmed,
    count: String(GEOCODE.results),
    language,
    format: 'json',
  });

  const result = await fetchJson(`${GEOCODE.searchUrl}?${params}`, {
    timeoutMs: GEOCODE.timeoutMs,
    retries: 1,
  });
  if (!result.ok) return result;

  const items = (result.data?.results ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country ?? '',
    region: item.admin1 ?? '',
    lat: round(item.latitude),
    lon: round(item.longitude),
    timeZone: item.timezone ?? null,
  }));

  return { ok: true, items };
}

/**
 * Название точки по координатам (BigDataCloud, без ключа).
 * Падение не критично: вернём координаты как имя.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ok: true, place: object}>}
 */
export async function reverseGeocode(lat, lon, language = GEOCODE.language) {
  const approxLat = round(lat);
  const approxLon = round(lon);
  const fallback = {
    name: `${approxLat.toFixed(2)}, ${approxLon.toFixed(2)}`,
    country: '',
    lat: approxLat,
    lon: approxLon,
    timeZone: deviceTimeZone(),
  };

  const params = new URLSearchParams({
    latitude: String(approxLat),
    longitude: String(approxLon),
    localityLanguage: language,
  });

  const result = await fetchJson(`${GEOCODE.reverseUrl}?${params}`, {
    timeoutMs: GEOCODE.timeoutMs,
    retries: 0,
  });
  if (!result.ok) return { ok: true, place: fallback };

  const data = result.data ?? {};
  const name = data.city || data.locality || data.principalSubdivision || fallback.name;
  const region = data.principalSubdivision && data.principalSubdivision !== name
    ? data.principalSubdivision
    : '';

  return {
    ok: true,
    place: {
      name,
      country: data.countryName ?? region,
      lat: approxLat,
      lon: approxLon,
      timeZone: deviceTimeZone(),
    },
  };
}

/**
 * Грубая локация по IP — последний шанс перед демо-городом.
 * Название стараемся локализовать обратным геокодированием, но пояс берём из IP.
 * @returns {Promise<{ok: true, place: object} | {ok: false, reason: string}>}
 */
export async function locateByIp(language = GEOCODE.language) {
  const result = await fetchJson(GEOCODE.ipUrl, { timeoutMs: GEOCODE.timeoutMs, retries: 1 });
  if (!result.ok) return result;

  const data = result.data ?? {};
  if (data.success === false || typeof data.latitude !== 'number') {
    return { ok: false, reason: 'shape' };
  }

  const place = {
    name: data.city || data.region || data.country || (language === 'en' ? 'Current location' : 'Текущее место'),
    country: data.country ?? '',
    lat: round(data.latitude),
    lon: round(data.longitude),
    timeZone: data.timezone?.id ?? null,
  };

  return { ok: true, place: await localizeName(place, language) };
}

/**
 * Подменяет англоязычное имя из IP-базы на локальное, если удалось.
 * @param {object} place
 * @param {string} [language]
 * @returns {Promise<object>}
 */
async function localizeName(place, language = GEOCODE.language) {
  const reverse = await reverseGeocode(place.lat, place.lon, language);
  const candidate = reverse?.place;
  const isCoordinates = /^-?\d+[.,]\d+,\s*-?\d+[.,]\d+$/.test(candidate?.name ?? '');

  if (!candidate || !candidate.name || isCoordinates) return place;

  return {
    ...place,
    name: candidate.name,
    country: candidate.country || place.country,
  };
}
