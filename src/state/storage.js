// Безопасная обёртка над localStorage: приватный режим и переполнение не должны
// ронять приложение. Если хранилище недоступно — держим данные в памяти.

const memory = new Map();

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // доступ к localStorage может бросить в песочнице/приватном режиме
  }
}

/**
 * @param {string} key
 * @returns {any|null}
 */
export function readJson(key) {
  const store = safeStorage();
  if (store) {
    try {
      const raw = store.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {
      // повреждённый JSON — читаем из памяти ниже
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

/**
 * @param {string} key
 * @param {any} value
 */
export function writeJson(key, value) {
  memory.set(key, value);
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // квота или запрет записи — памяти достаточно
  }
}

/**
 * @param {string} key
 */
export function removeKey(key) {
  memory.delete(key);
  const store = safeStorage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // игнорируем
  }
}
