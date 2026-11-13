// Фенологическая фаза года. Не четыре переключателя, а непрерывная величина:
// 0 — зимнее солнцестояние, 0.25 — весеннее равноденствие, 0.5 — летнее, 0.75 — осеннее.
// Полушарие сдвигает кривую на полгода.

const YEAR_DAYS = 365.2422;

/** День зимнего солнцестояния в северном полушарии. */
const WINTER_SOLSTICE_DAY = 355;

/**
 * @param {number} dayOfYear 1…366
 * @param {'N'|'S'} [hemisphere]
 * @returns {number} 0…1
 */
export function seasonPhase(dayOfYear, hemisphere = 'N') {
  const shift = hemisphere === 'S' ? YEAR_DAYS / 2 : 0;
  const position = dayOfYear - WINTER_SOLSTICE_DAY - shift;
  const wrapped = ((position % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  return wrapped / YEAR_DAYS;
}

const SEASONS = [
  { key: 'winter', center: 0 },
  { key: 'spring', center: 0.25 },
  { key: 'summer', center: 0.5 },
  { key: 'autumn', center: 0.75 },
];

/**
 * Ближайший сезон по фазе (для земли и листвы; небо интерполируется отдельно).
 * @param {number} phase 0…1
 * @returns {'winter'|'spring'|'summer'|'autumn'}
 */
export function seasonKey(phase) {
  let best = SEASONS[0];
  let bestDistance = Infinity;

  for (const season of SEASONS) {
    const raw = Math.abs(phase - season.center);
    const distance = Math.min(raw, 1 - raw); // фаза циклична
    if (distance < bestDistance) {
      bestDistance = distance;
      best = season;
    }
  }

  return best.key;
}

/**
 * Веса двух ближайших сезонов — чтобы земля тоже менялась плавно.
 * @param {number} phase 0…1
 * @returns {Array<{key: string, weight: number}>}
 */
export function seasonWeights(phase) {
  const scaled = ((phase % 1) + 1) % 1 * 4;
  const index = Math.floor(scaled) % 4;
  const local = scaled - Math.floor(scaled);
  const current = SEASONS[index];
  const next = SEASONS[(index + 1) % 4];

  return [
    { key: current.key, weight: 1 - local },
    { key: next.key, weight: local },
  ];
}
