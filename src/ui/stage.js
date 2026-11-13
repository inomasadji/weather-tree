// Сцена: логический буфер и целочисленный апскейл.
// На M2 здесь появится рендер, пока — только заливка фона.

import { LOGICAL, PLACEHOLDER_BG } from '../config.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} holder контейнер, в который вписываем сцену
 */
export function createStage(canvas, holder) {
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = LOGICAL.width;
  canvas.height = LOGICAL.height;
  ctx.imageSmoothingEnabled = false;

  function paintPlaceholder() {
    ctx.fillStyle = PLACEHOLDER_BG;
    ctx.fillRect(0, 0, LOGICAL.width, LOGICAL.height);
  }

  /** Апскейл только целым множителем: иначе пиксели поплывут. */
  function fit() {
    const width = holder.clientWidth;
    const height = holder.clientHeight;
    if (!width || !height) return 1;
    const scale = Math.max(1, Math.floor(Math.min(width / LOGICAL.width, height / LOGICAL.height)));
    canvas.style.width = `${LOGICAL.width * scale}px`;
    canvas.style.height = `${LOGICAL.height * scale}px`;
    return scale;
  }

  const observer = new ResizeObserver(fit);
  observer.observe(holder);

  paintPlaceholder();
  fit();

  return { ctx, fit, paintPlaceholder };
}
