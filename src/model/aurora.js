// Видимость полярного сияния: планетарный Kp, широта места, темнота неба и облачность.
// Чистая функция — тестируется в Node без DOM. Одна и та же формула работает
// для обоих полушарий: в южном это aurora australis, зеркальная по широте.

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Граница аврорального овала: каждый балл Kp спускает сияние примерно на 2.6°
 * к экватору (Kp 0 — 67°, Kp 5 — 54°, Kp 9 — 43°). Числа эмпирические:
 * овал — не окружность, но для «видно/не видно» этого достаточно.
 * @param {number} kp
 * @returns {number} широта в градусах
 */
export function auroraEdgeLat(kp) {
  return 67 - Math.max(0, Math.min(9, kp)) * 2.6;
}

/**
 * @param {{kp?: number, lat?: number, sunAltitudeDeg?: number, cloudPct?: number}} input
 * @returns {number} 0…1 — насколько ярко рисовать сияние
 */
export function auroraStrength({ kp = 0, lat = 0, sunAltitudeDeg = 0, cloudPct = 0 } = {}) {
  if (!(kp > 0) || !Number.isFinite(lat)) return 0;

  const margin = Math.abs(lat) - auroraEdgeLat(kp);
  if (margin < -3) return 0;

  // Чем ближе к полюсу от границы овала, тем ярче и выше занавес.
  const place = clamp01((margin + 3) / 9);
  // Сияние видно только в темноте: сумерки его гасят.
  const dark = clamp01((-sunAltitudeDeg - 3) / 6);
  // Облака закрывают небо почти полностью, но не целиком.
  const clear = clamp01(1 - (cloudPct / 100) * 0.9);

  return clamp01(place * dark * clear);
}
