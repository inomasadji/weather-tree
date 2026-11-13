// Откуда берём точку: сохранённый выбор → геолокация → IP → демо-город.
// Результат кэшируется, чтобы не спрашивать разрешение при каждом визите.

import { FALLBACK_PLACE, STORAGE_KEYS } from '../config.js';
import { readJson, writeJson } from './storage.js';
import { locateByIp, reverseGeocode } from '../api/geocode.js';

const GEO_TIMEOUT_MS = 10_000;
const COORD_EPSILON = 0.05;

/**
 * @param {any} place
 * @returns {boolean}
 */
export function isValidPlace(place) {
  return Boolean(
    place &&
      typeof place.lat === 'number' &&
      Number.isFinite(place.lat) &&
      typeof place.lon === 'number' &&
      Number.isFinite(place.lon) &&
      typeof place.name === 'string' &&
      place.name.length > 0,
  );
}

/** @returns {object|null} */
export function readPlace() {
  const saved = readJson(STORAGE_KEYS.place);
  return isValidPlace(saved) ? saved : null;
}

/** @param {object} place */
export function savePlace(place) {
  if (isValidPlace(place)) writeJson(STORAGE_KEYS.place, place);
}

/**
 * Совпадают ли точки с точностью до ~5 км — для проверки, годится ли кэш.
 * @param {object|null} a
 * @param {object|null} b
 * @returns {boolean}
 */
export function samePlace(a, b) {
  if (!isValidPlace(a) || !isValidPlace(b)) return false;
  return Math.abs(a.lat - b.lat) < COORD_EPSILON && Math.abs(a.lon - b.lon) < COORD_EPSILON;
}

/**
 * Разрешение геолокации браузера. Никогда не бросает: при отказе, таймауте
 * или отсутствии API возвращает null.
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
function browserCoordinates() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), GEO_TIMEOUT_MS);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => finish({ lat: position.coords.latitude, lon: position.coords.longitude }),
        () => finish(null),
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60_000 },
      );
    } catch {
      // В iframe/песочнице API может бросить синхронно.
      finish(null);
    }
  });
}

/**
 * @returns {Promise<{place: object, source: 'saved'|'geo'|'ip'|'fallback'}>}
 */
export async function resolvePlace() {
  const saved = readPlace();
  if (saved) return { place: saved, source: 'saved' };

  const coords = await browserCoordinates();
  if (coords) {
    const { place } = await reverseGeocode(coords.lat, coords.lon);
    savePlace(place);
    return { place, source: 'geo' };
  }

  const byIp = await locateByIp();
  if (byIp.ok) {
    savePlace(byIp.place);
    return { place: byIp.place, source: 'ip' };
  }

  // Демо-город не сохраняем: при следующем визите снова попробуем геолокацию.
  return { place: { ...FALLBACK_PLACE }, source: 'fallback' };
}
