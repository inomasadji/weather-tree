// Гладкий детерминированный шум для облаков и звёздных полей.
// Никакого Math.random(): одинаковый seed → одинаковая картинка.

/**
 * @param {number} ix
 * @param {number} iy
 * @param {number} seed
 * @returns {number} 0…1
 */
export function hash2(ix, iy, seed = 0) {
  let value = (ix * 374_761_393 + iy * 668_265_263 + seed * 69_069) | 0;
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 4_294_967_296;
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * Value noise с опциональной периодичностью по X — для бесшовных облаков.
 * @param {number} x
 * @param {number} y
 * @param {{seed?: number, periodX?: number}} [options]
 * @returns {number} 0…1
 */
export function valueNoise2D(x, y, { seed = 0, periodX = 0 } = {}) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);

  const wrap = periodX > 0
    ? (value) => ((value % periodX) + periodX) % periodX
    : (value) => value;

  const xa = wrap(x0);
  const xb = wrap(x0 + 1);

  const topLeft = hash2(xa, y0, seed);
  const topRight = hash2(xb, y0, seed);
  const bottomLeft = hash2(xa, y0 + 1, seed);
  const bottomRight = hash2(xb, y0 + 1, seed);

  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Фрактальный шум: сумма октав с затуханием.
 * @param {number} x
 * @param {number} y
 * @param {{octaves?: number, seed?: number, periodX?: number, lacunarity?: number, gain?: number}} [options]
 * @returns {number} 0…1
 */
export function fbm2D(x, y, {
  octaves = 4,
  seed = 0,
  periodX = 0,
  lacunarity = 2,
  gain = 0.5,
} = {}) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, y * frequency, {
      seed: seed + octave * 17,
      periodX: periodX * frequency,
    }) * amplitude;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return sum / normalization;
}
