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

  const frame = ctx.createImageData(LOGICAL.width, LOGICAL.height);

  /**
   * Копирует пиксельный буфер на canvas. Единственный путь попадания пикселей
   * на экран — никаких drawImage со сглаживанием.
   * @param {import('../render/surface.js').Surface} surface
   */
  function present(surface) {
    frame.data.set(surface.data);
    ctx.putImageData(frame, 0, 0);
  }

  function paintPlaceholder() {
    ctx.fillStyle = PLACEHOLDER_BG;
    ctx.fillRect(0, 0, LOGICAL.width, LOGICAL.height);
  }

  /** Апскейл: целый множитель, если он даёт хотя бы 2×, иначе — дробный до ширины. */
  function fit() {
    const width = holder.clientWidth;
    const height = holder.clientHeight;
    if (!width || !height) return 1;

    const raw = Math.min(width / LOGICAL.width, height / LOGICAL.height);
    const integer = Math.floor(raw);
    // На телефоне целый множитель даёт «марку» 320×180 посреди экрана.
    // pixelated всё равно не размывает, поэтому там тянемся по ширине.
    const scale = integer >= 2 ? integer : Math.max(raw, 1);

    canvas.style.width = `${Math.round(LOGICAL.width * scale)}px`;
    canvas.style.height = `${Math.round(LOGICAL.height * scale)}px`;
    return scale;
  }

  const observer = new ResizeObserver(fit);
  observer.observe(holder);

  paintPlaceholder();
  fit();

  return { ctx, fit, present, paintPlaceholder };
}
