// Цвета сцены. Пиксель — это uint32, записанный прямо в буфер как R,G,B,A байты.
// Порядок упаковки соответствует little-endian (все актуальные браузеры и Node).
// Поэтому каналы читаются масками, а не через структуры.

/** @type {boolean} */
export const LITTLE_ENDIAN =
  new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1;

/**
 * Упаковка канала в пиксель. Возвращает значение, пригодное для Uint32Array.
 * @param {number} r 0…255
 * @param {number} g 0…255
 * @param {number} b 0…255
 * @param {number} [a] 0…255
 * @returns {number}
 */
export function pack(r, g, b, a = 255) {
  const rr = r & 255;
  const gg = g & 255;
  const bb = b & 255;
  const aa = a & 255;
  return LITTLE_ENDIAN
    ? ((aa << 24) | (bb << 16) | (gg << 8) | rr) >>> 0
    : ((rr << 24) | (gg << 16) | (bb << 8) | aa) >>> 0;
}

/**
 * '#a8d46a' или '#a8d' → пиксель.
 * @param {string} hex
 * @param {number} [alpha]
 * @returns {number}
 */
export function hexColor(hex, alpha = 255) {
  const value = hex.replace('#', '').trim();
  if (value.length === 3) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    return pack(r, g, b, alpha);
  }
  if (value.length === 6) {
    return pack(
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
      alpha,
    );
  }
  throw new Error(`Некорректный цвет: ${hex}`);
}

/**
 * @param {number} color
 * @returns {{r: number, g: number, b: number, a: number}}
 */
export function unpack(color) {
  return {
    r: color & 255,
    g: (color >>> 8) & 255,
    b: (color >>> 16) & 255,
    a: (color >>> 24) & 255,
  };
}

/**
 * Линейный переход между двумя цветами: t=0 → a, t=1 → b.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function mixColor(a, b, t) {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t;
  const g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  const al = ((a >>> 24) & 255) + (((b >>> 24) & 255) - ((a >>> 24) & 255)) * t;
  return pack(Math.round(r), Math.round(g), Math.round(bl), Math.round(al));
}

/**
 * Тот же цвет с другой прозрачностью — для слоёв тумана и ночного тинта.
 * @param {number} color
 * @param {number} alpha 0…255
 * @returns {number}
 */
export function withAlpha(color, alpha) {
  return pack(color & 255, (color >>> 8) & 255, (color >>> 16) & 255, alpha);
}
