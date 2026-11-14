// Планетарный Kp-индекс: NOAA SWPC, без ключа и с CORS.
// Сиянию достаточно одного запроса раз в полчаса; погода от него не зависит,
// поэтому ошибка здесь не должна ничего ломать — просто нет сияния.

import { fetchJson } from './http.js';

export const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

/**
 * Последний Kp из ответа SWPC. Ответ — массив трёхчасовых строк,
 * последняя строка самая свежая; иногда поле приходит в нижнем регистре.
 * @param {unknown} rows
 * @returns {number|null}
 */
export function lastKp(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const value = Number(row?.Kp ?? row?.kp);
    if (Number.isFinite(value)) return Math.max(0, Math.min(9, value));
  }

  return null;
}

/**
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{ok: true, kp: number} | {ok: false, reason: string}>}
 */
export async function fetchKp(options = {}) {
  const result = await fetchJson(KP_URL, { retries: 1, ...options });
  if (!result.ok) return result;

  const kp = lastKp(result.data);
  if (kp === null) return { ok: false, reason: 'shape' };

  return { ok: true, kp };
}
