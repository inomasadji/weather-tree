// Тонкая обёртка над fetch: таймаут, повторы, нормализованный результат.
// Все сетевые модули возвращают {ok, ...} и никогда не бросают исключение наружу.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} url
 * @param {{timeoutMs?: number, retries?: number, headers?: Record<string,string>}} [options]
 * @returns {Promise<{ok: true, data: any} | {ok: false, reason: string}>}
 */
export async function fetchJson(url, { timeoutMs = 8000, retries = 2, headers } = {}) {
  let reason = 'network';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', ...headers },
      });

      if (response.ok) {
        return { ok: true, data: await response.json() };
      }

      reason = `http:${response.status}`;
      // 4xx (кроме 429) повторять бессмысленно — запрос неверный.
      if (response.status < 500 && response.status !== 429) return { ok: false, reason };
    } catch (error) {
      reason = error && error.name === 'AbortError' ? 'timeout' : 'network';
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) await sleep(300 * 2 ** attempt);
  }

  return { ok: false, reason };
}
