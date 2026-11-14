// Пиксельный буфер и примитивы. Никакого DOM: модуль импортируется в node --test
// и в tools/snapshot.mjs. Все координаты целые, антиалиасинга нет по определению.

import { pack, hexColor, mixColor, unpack, withAlpha } from './color.js';

/** Матрица Байера 4×4: даёт регулярный «шахматный» переход между двумя цветами. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Порог дизеринга для пикселя: 0…1.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function bayerThreshold(x, y) {
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

export class Surface {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.pixels = new Uint32Array(this.data.buffer);
  }

  /** @param {number} [color] */
  clear(color = pack(0, 0, 0)) {
    this.pixels.fill(color);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} color
   */
  pixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = color;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} пиксель или 0 вне буфера
   */
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.pixels[y * this.width + x];
  }

  /**
   * Заливка с отсечением по границам.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} color
   */
  fillRect(x, y, w, h, color) {
    const x0 = Math.max(0, Math.trunc(x));
    const y0 = Math.max(0, Math.trunc(y));
    const x1 = Math.min(this.width, Math.trunc(x + w));
    const y1 = Math.min(this.height, Math.trunc(y + h));
    if (x1 <= x0 || y1 <= y0) return;

    for (let row = y0; row < y1; row += 1) {
      const start = row * this.width;
      this.pixels.fill(color, start + x0, start + x1);
    }
  }

  /**
   * Линия Брезенхема, без сглаживания.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} color
   */
  line(x0, y0, x1, y1, color) {
    let x = Math.trunc(x0);
    let y = Math.trunc(y0);
    const tx = Math.trunc(x1);
    const ty = Math.trunc(y1);

    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      this.pixel(x, y, color);
      if (x === tx && y === ty) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  /**
   * Залитый эллипс: сканлайны по целым пикселям.
   * @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} color
   */
  ellipse(cx, cy, rx, ry, color) {
    if (rx < 0 || ry < 0) return;
    if (ry === 0) {
      this.fillRect(cx - rx, cy, rx * 2 + 1, 1, color);
      return;
    }

    for (let dy = -ry; dy <= ry; dy += 1) {
      const ratio = dy / (ry + 0.5);
      const span = Math.floor(Math.sqrt(Math.max(0, 1 - ratio * ratio)) * (rx + 0.5));
      this.fillRect(cx - span, cy + dy, span * 2 + 1, 1, color);
    }
  }

  /** @param {number} cx @param {number} cy @param {number} r @param {number} color */
  circle(cx, cy, r, color) {
    this.ellipse(cx, cy, r, r, color);
  }

  /**
   * Вертикальный градиент с дизерингом между соседними стопами.
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @param {Array<{at: number, color: number}>} stops от 0 (верх) до 1 (низ)
   * @param {{bands?: number}} [options] bands > 1 — квантовать в полосы и дизерить только стыки
   */
  gradientV(x, y, w, h, stops, { bands = 0 } = {}) {
    if (h <= 0 || w <= 0 || stops.length === 0) return;

    const sorted = [...stops].sort((a, b) => a.at - b.at);
    const x0 = Math.max(0, Math.trunc(x));
    const y0 = Math.max(0, Math.trunc(y));
    const x1 = Math.min(this.width, Math.trunc(x + w));
    const y1 = Math.min(this.height, Math.trunc(y + h));
    const levels = bands > 1 ? bands : 0;

    for (let row = y0; row < y1; row += 1) {
      const t = h > 1 ? (row - y) / (h - 1) : 0;
      const { from, to, local } = levels
        ? sampleBanded(sorted, t, levels)
        : sampleStops(sorted, t);
      const line = row * this.width;

      for (let col = x0; col < x1; col += 1) {
        this.pixels[line + col] = local > bayerThreshold(col, row) ? to : from;
      }
    }
  }

  /**
   * Полупрозрачный прямоугольник: смешивание с тем, что уже нарисовано.
   * Нужен для туманной дымки и ночного тинта.
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @param {number} color цвет с альфой
   */
  veil(x, y, w, h, color) {
    const alpha = unpack(color).a / 255;
    if (alpha <= 0) return;

    const solid = withAlpha(color, 255);
    const x0 = Math.max(0, Math.trunc(x));
    const y0 = Math.max(0, Math.trunc(y));
    const x1 = Math.min(this.width, Math.trunc(x + w));
    const y1 = Math.min(this.height, Math.trunc(y + h));

    for (let row = y0; row < y1; row += 1) {
      const line = row * this.width;
      for (let col = x0; col < x1; col += 1) {
        this.pixels[line + col] = mixColor(this.pixels[line + col], solid, alpha);
      }
    }
  }

  /**
   * Дизеринг-переход между кадрами: доля t пикселей берётся из `other`.
   * t=0 — остаётся текущий кадр, t=1 — полностью кадр `other`.
   * Так смена погоды выглядит как пиксельный «проявитель», а не как скачок.
   * @param {Surface} other
   * @param {number} t 0…1
   */
  dissolve(other, t) {
    const ratio = Math.min(1, Math.max(0, t));
    if (ratio <= 0) return;
    if (ratio >= 1) {
      this.pixels.set(other.pixels);
      return;
    }

    for (let y = 0; y < this.height; y += 1) {
      const line = y * this.width;
      for (let x = 0; x < this.width; x += 1) {
        if (bayerThreshold(x, y) < ratio) this.pixels[line + x] = other.pixels[line + x];
      }
    }
  }

  /**
   * Детерминированный «шум» для травы, снега и кроны: одинаковый на одинаковых входах.
   * @param {number} x @param {number} y
   * @param {number} seed
   * @returns {number} 0…1
   */
  static noise(x, y, seed = 0) {
    let value = (x * 374_761_393 + y * 668_265_263 + seed * 69_069) | 0;
    value = (value ^ (value >>> 13)) * 1_274_126_177;
    value = (value ^ (value >>> 16)) >>> 0;
    return value / 4_294_967_296;
  }
}

/**
 * Ищет пару стопов, между которыми лежит t.
 * @param {Array<{at: number, color: number}>} stops уже отсортированные
 * @param {number} t
 * @returns {{from: number, to: number, local: number}}
 */
function sampleStops(stops, t) {
  if (t <= stops[0].at) return { from: stops[0].color, to: stops[0].color, local: 0 };

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (t <= current.at) {
      const span = current.at - previous.at || 1;
      return {
        from: previous.color,
        to: current.color,
        local: (t - previous.at) / span,
      };
    }
  }

  const last = stops[stops.length - 1].color;
  return { from: last, to: last, local: 0 };
}

/**
 * Непрерывный цвет в точке t — только для квантованных градиентов.
 * @param {Array<{at: number, color: number}>} stops
 * @param {number} t
 * @returns {number}
 */
function sampleColor(stops, t) {
  const { from, to, local } = sampleStops(stops, t);
  return mixColor(from, to, local);
}

/**
 * Градиент, разбитый на полосы: внутри полосы цвет постоянный,
 * на стыке — дизеринг между соседними полосами. Именно так выглядит
 * пиксельное небо, а не сплошная «шахматка».
 * @param {Array<{at: number, color: number}>} stops
 * @param {number} t
 * @param {number} bands
 * @returns {{from: number, to: number, local: number}}
 */
function sampleBanded(stops, t, bands) {
  const scaled = Math.min(1, Math.max(0, t)) * bands;
  const index = Math.min(bands - 1, Math.floor(scaled));
  return {
    from: sampleColor(stops, index / bands),
    to: sampleColor(stops, (index + 1) / bands),
    local: scaled - index,
  };
}

export { pack, hexColor, mixColor };
