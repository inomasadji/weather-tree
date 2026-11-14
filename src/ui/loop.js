// Защита цикла рендера: считает подряд идущие ошибки и просит остановиться,
// чтобы исключение не превращалось в бесконечный поток в консоли и чёрный экран.

/**
 * @param {{maxErrors?: number, onError?: (error: Error) => void}} [options]
 */
export function createFrameGuard({ maxErrors = 3, onError } = {}) {
  let failures = 0;

  return {
    /**
     * @param {() => void} render
     * @returns {boolean} получилось ли отрисовать кадр
     */
    attempt(render) {
      try {
        render();
        failures = 0;
        return true;
      } catch (error) {
        failures += 1;
        if (onError) onError(error);
        else console.error('[weather-tree] кадр не отрисован:', error);
        return false;
      }
    },

    /** @returns {number} */
    get failures() {
      return failures;
    },

    /** Пора останавливать цикл. */
    get exhausted() {
      return failures >= maxErrors;
    },

    reset() {
      failures = 0;
    },
  };
}

/**
 * Ограничитель частоты кадров: на 120-герцовом экране пропускает лишние тики,
 * чтобы не удваивать нагрузку без пользы для пиксельной сцены.
 * @param {{maxFps?: number}} [options]
 */
export function createFramePacer({ maxFps = 60 } = {}) {
  const minIntervalMs = 1000 / Math.max(1, maxFps);
  let lastDrawAt = -Infinity;

  return {
    /**
     * @param {number} now мс из requestAnimationFrame
     * @returns {boolean} пора ли рисовать следующий кадр
     */
    shouldDraw(now) {
      // Допуск 0.5 мс гасит джиттер rAF, чтобы 60 Гц экран не падал в 30 fps.
      if (now - lastDrawAt < minIntervalMs - 0.5) return false;
      lastDrawAt = now;
      return true;
    },

    reset() {
      lastDrawAt = -Infinity;
    },
  };
}
