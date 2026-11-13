// Местоположение: поиск города, обратное геокодирование точки, IP-fallback.
// Всё — бесплатные открытые API без ключей.

import { GEOCODE } from '../config.js';
import { fetchJson } from './http.js';

const round = (value) => Math.round(value * 10_000) / 10_000;

/**
 * Поиск города по названию (Open-Meteo Geocoding).
 * @param {string} query
 * @returns {Promise<{ok: true, items: Array<object>} | {ok: false, reason: string}>}
 */
export async function searchPlaces(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, items: [] };

  const params = new URLSearchParams({
    name: trimmed,
    count: String(GEOCODE.results),
    language: GEOCODE.language,
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
    timezone: item.timezone ?? null,
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
export async function reverseGeocode(lat, lon) {
  const fallback = {
    name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    country: '',
    lat: round(lat),
    lon: round(lon),
  };

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    localityLanguage: GEOCODE.language,
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
      lat: round(lat),
      lon: round(lon),
    },
  };
}

/**
 * Грубая локация по IP — последний шанс перед демо-городом.
 * @returns {Promise<{ok: true, place: object} | {ok: false, reason: string}>}
 */
export async function locateByIp() {
  const result = await fetchJson(GEOCODE.ipUrl, { timeoutMs: GEOCODE.timeoutMs, retries: 1 });
  if (!result.ok) return result;

  const data = result.data ?? {};
  if (data.success === false || typeof data.latitude !== 'number') {
    return { ok: false, reason: 'shape' };
  }

  return {
    ok: true,
    place: {
      name: data.city || data.region || data.country || 'Текущее место',
      country: data.country ?? '',
      lat: round(data.latitude),
      lon: round(data.longitude),
    },
  };
}
