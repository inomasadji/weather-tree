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
