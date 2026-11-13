// Цепочка провайдеров погоды. Оба бесплатные и без ключа, но доступны из разных сетей:
// api.open-meteo.com блокируется, например, в РФ, а wttr.in оттуда отвечает.
// Рабочий провайдер запоминается, чтобы не ждать таймаут при каждом обновлении.

import { STORAGE_KEYS } from '../config.js';
import { readJson, writeJson } from '../state/storage.js';
import { fetchStation as fetchOpenMeteo } from './openMeteo.js';
import { fetchStation as fetchWttr } from './wttr.js';

const PROVIDERS = {
  'open-meteo': fetchOpenMeteo,
  'wttr.in': fetchWttr,
};

/** Порядок по умолчанию: сначала более точный, потом запасной. */
export const PROVIDER_ORDER = ['open-meteo', 'wttr.in'];

/** @returns {string|null} */
export function readPreferredProvider() {
  const saved = readJson(STORAGE_KEYS.provider);
  return typeof saved === 'string' && PROVIDERS[saved] ? saved : null;
}

/** @param {string} id */
export function rememberProvider(id) {
  if (PROVIDERS[id]) writeJson(STORAGE_KEYS.provider, id);
}

/**
 * Порядок попыток: сначала запомненный провайдер, остальные — по умолчанию.
 * @param {string|null} preferred
 * @returns {string[]}
 */
export function providerChain(preferred) {
  const rest = PROVIDER_ORDER.filter((id) => id !== preferred);
  return preferred && PROVIDERS[preferred] ? [preferred, ...rest] : rest;
}

/**
 * @param {{lat: number, lon: number, name: string, country?: string, timeZone?: string}} place
 * @returns {Promise<{ok: true, station: object, provider: string, tried: object[]} |
 *                   {ok: false, reason: string, tried: object[]}>}
 */
export async function fetchWeather(place) {
  const tried = [];

  for (const id of providerChain(readPreferredProvider())) {
    const result = await PROVIDERS[id](place);

    if (result.ok) {
      rememberProvider(id);
      return {
        ok: true,
        provider: id,
        station: { ...result.station, provider: id },
        tried,
      };
    }

    tried.push({ id, reason: result.reason });
  }

  const reason = tried.some((item) => item.reason === 'network' || item.reason === 'timeout')
    ? 'network'
    : tried.at(-1)?.reason ?? 'network';

  return { ok: false, reason, tried };
}
