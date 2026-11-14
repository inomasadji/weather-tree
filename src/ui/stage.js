// Сцена: адаптивный логический буфер и целочисленный (на узком экране — дробный) апскейл
// на весь экран без искажения пропорций пикселей.

import { LOGICAL, PLACEHOLDER_BG } from '../config.js';

/**
 * Подбирает масштаб и логическое разрешение буфера так, чтобы сцена заполняла
 * весь контейнер (100 % viewport) без пустых полей и с сохранением места под дерево.
 * @param {number} width
 * @param {number} height
 * @returns {{scale: number, logicalWidth: number, logicalHeight: number, cssWidth: number, cssHeight: number}}
 */
export function computeStageLayout(width, height) {
  if (!width || !height) {
    return {
      scale: 1,
      logicalWidth: LOGICAL.width,
      logicalHeight: LOGICAL.height,
      cssWidth: LOGICAL.width,
      cssHeight: LOGICAL.height,
    };
  }

  let scale;
  if (width >= height) {
    const raw = Math.min(width / LOGICAL.width, height / LOGICAL.height);
    const integer = Math.floor(raw);
    scale = integer >= 2
      ? integer
      : Math.max(1, Math.min(width / 260, height / LOGICAL.height));
  } else {
    // На узком портрете дерево (~130 px шириной) должно помещаться целиком.
    const minLogicalWidth = width >= 600 ? 240 : 180;
    const raw = width / minLogicalWidth;
    const integer = Math.floor(raw);
    scale = integer >= 2 ? integer : Math.max(raw, 1);
  }

  const logicalWidth = Math.max(1, Math.ceil(width / scale));
  const logicalHeight = Math.max(1, Math.ceil(height / scale));

  return {
    scale,
    logicalWidth,
    logicalHeight,
    cssWidth: Math.round(logicalWidth * scale),
    cssHeight: Math.round(logicalHeight * scale),
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} holder контейнер, который заполняем сценой
 * @param {{onResize?: (size: {width: number, height: number}) => void}} [options]
 */
export function createStage(canvas, holder, { onResize } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let currentWidth = LOGICAL.width;
  let currentHeight = LOGICAL.height;
  canvas.width = currentWidth;
  canvas.height = currentHeight;
  ctx.imageSmoothingEnabled = false;

  let frame = ctx.createImageData(currentWidth, currentHeight);

  /**
   * Копирует пиксельный буфер на canvas. Единственный путь попадания пикселей
   * на экран — никаких drawImage со сглаживанием.
   * @param {import('../render/surface.js').Surface} surface
   */
  function present(surface) {
    if (surface.width !== currentWidth || surface.height !== currentHeight) return;
    frame.data.set(surface.data);
    ctx.putImageData(frame, 0, 0);
  }

  function paintPlaceholder() {
    ctx.fillStyle = PLACEHOLDER_BG;
    ctx.fillRect(0, 0, currentWidth, currentHeight);
  }

  /** Подгоняет логический буфер и CSS-размер под 100 % площади контейнера. */
  function fit() {
    const width = holder.clientWidth;
    const height = holder.clientHeight;
    if (!width || !height) return 1;

    const layout = computeStageLayout(width, height);
    const resized = layout.logicalWidth !== currentWidth || layout.logicalHeight !== currentHeight;

    if (resized) {
      currentWidth = layout.logicalWidth;
      currentHeight = layout.logicalHeight;
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.imageSmoothingEnabled = false;
      frame = ctx.createImageData(currentWidth, currentHeight);
      paintPlaceholder();
    }

    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;

    if (resized && onResize) onResize({ width: currentWidth, height: currentHeight });
    return layout.scale;
  }

  const observer = new ResizeObserver(fit);
  observer.observe(holder);

  paintPlaceholder();
  fit();

  return {
    ctx,
    fit,
    present,
    paintPlaceholder,
    size: () => ({ width: currentWidth, height: currentHeight }),
  };
}
