// Облака: три слоя с параллаксом. Поле шума считается один раз, а порог берётся
// по квантилю — поэтому «облачность 5 %» действительно означает ~5 % неба,
// а не случайную горсть пикселей.

import { fbm2D, hash2 } from './noise.js';
import { mixColor } from './color.js';
import { skyToneAt } from '../model/palette.js';
import { HORIZON_Y } from '../config.js';

const BINS = 64;

const LAYER_SPECS = [
  // Самая высокая пелена: тонкая, почти неподвижная — верхний план параллакса.
  { seed: 7, y: 0, height: 24, scaleX: 54, scaleY: 12, octaves: 2, share: 0.06, minCoverage: 0.3, speed: 0.16, offset: 0.05 },
  // Высокая пелена: мелкая, медленная, самая дальняя.
  { seed: 11, y: 0, height: 34, scaleX: 28, scaleY: 16, octaves: 2, share: 0.2, minCoverage: 0.15, speed: 0.35, offset: 0.2 },
  // Средний слой.
  { seed: 29, y: 8, height: 50, scaleX: 36, scaleY: 20, octaves: 3, share: 0.35, minCoverage: 0.08, speed: 0.6, offset: 0.55 },
  // Низкие кучевые: крупные, быстрые, ближе всех.
  { seed: 47, y: 26, height: 92, scaleX: 48, scaleY: 26, octaves: 3, share: 0.5, minCoverage: 0.03, speed: 1, offset: 0.9 },
];

/**
 * Строит поля шума и гистограммы значений для каждого слоя.
 * @param {number} width ширина сцены
 * @returns {Array<object>}
 */
export function createCloudLayers(width) {
  return LAYER_SPECS.map((spec) => {
    // Два пикселя сверху и снизу: соседи для расчёта кромок всегда существуют,
    // иначе верхняя строка полосы становится сплошной линией на всё небо.
    const padded = 2;
    const paddedHeight = spec.height + padded * 2;
    const values = new Float32Array(width * paddedHeight);

    for (let y = -padded; y < spec.height + padded; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = fbm2D(x / spec.scaleX, y / spec.scaleY, {
          seed: spec.seed,
          octaves: spec.octaves,
          periodX: width / spec.scaleX,
        });
        values[(y + padded) * width + x] = value;
      }
    }

    const histogram = new Uint32Array(BINS);
    for (let y = 0; y < spec.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = values[(y + padded) * width + x];
        histogram[Math.min(BINS - 1, Math.floor(value * BINS))] += 1;
      }
    }

    return { ...spec, width, values, padded, histogram, total: width * spec.height };
  });
}

/**
 * Порог, выше которого лежит заданная доля пикселей слоя.
 * @param {object} layer
 * @param {number} fraction 0…1
 * @returns {number}
 */
export function quantileThreshold(layer, fraction) {
  const target = (1 - Math.min(0.95, Math.max(0, fraction))) * layer.total;
  let cumulative = 0;

  for (let bin = 0; bin < BINS; bin += 1) {
    cumulative += layer.histogram[bin];
    if (cumulative >= target) return bin / BINS;
  }

  return 1;
}

/**
 * Рисует облака. Порог зависит от облачности: 0 % — почти ничего, 100 % — плотный слой.
 * @param {import('./surface.js').Surface} surface
 * @param {Array<object>} layers
 * @param {{coverage: number, windKmh: number, timeMs: number, palette: object, sunAltitudeDeg: number, fog?: number, horizonY?: number}} options
 */
export function drawClouds(surface, layers, {
  coverage,
  windKmh,
  timeMs,
  palette,
  sunAltitudeDeg,
  fog = 0,
  horizonY = HORIZON_Y,
}) {
  if (coverage < 0.02) return;

  const lightFromBelow = sunAltitudeDeg < 8 && sunAltitudeDeg > -12;
  const seconds = timeMs / 1000;
  const skyScale = horizonY / HORIZON_Y;

  for (const layer of layers) {
    // Каждый следующий слой рисуется только при заметной облачности:
    // иначе три слоя накладываются и «35 %» превращаются в сплошной ковёр.
    if (coverage < layer.minCoverage) continue;

    // Кривая: при малой облачности слои дают редкие облака, при 100 % — сплошной слой.
    const fraction =
      layer.share * coverage ** 0.8 + (1 - layer.share) * coverage ** 3;
    const overcast = fraction >= 0.88;
    const threshold = overcast ? -1 : quantileThreshold(layer, fraction);
    const drift = seconds * layer.speed * (3 + windKmh * 0.55) + layer.offset * layer.width;
    const shift = Math.floor(drift) % layer.width;
    const height = layer.height - 1;
    const baseY = Math.round(layer.y * skyScale);

    for (let row = 0; row < layer.height; row += 1) {
      const screenY = baseY + row;
      if (screenY < 0 || screenY >= surface.height) continue;

      // Облако светится тем небом, на котором лежит: у горизонта — закатное,
      // в зените — холодное. Иначе сумрак получается ровно-фиолетовым.
      const tone = skyToneAt(palette.sky, screenY / horizonY);
      const fogMix = fog * (0.2 + 0.8 * Math.min(1, screenY / HORIZON_Y)) * 0.5;
      const body = mixColor(mixColor(tone, palette.cloudLight, 0.5), palette.haze, fogMix);
      const rim = mixColor(mixColor(body, palette.cloudRim, 0.65), palette.haze, fogMix * 0.8);
      const dark = mixColor(mixColor(body, palette.cloudDark, 0.6), palette.haze, fogMix);

      const rowStart = (row + layer.padded) * layer.width;

      // Края полосы не должны обрываться линейкой: пара строк с разрежением.
      const edgeFade = Math.min(row, height - row);

      for (let x = 0; x < layer.width; x += 1) {
        if (edgeFade < 2 && hash2(x, row, 53) < (2 - edgeFade) * 0.45) continue;

        const index = x + shift >= layer.width ? x + shift - layer.width : x + shift;

        if (overcast) {
          // Сплошной слой: дыры не нужны, но нужна фактура — два тона по рельефу.
          const value = layer.values[rowStart + index];
          let color = value > 0.48 ? body : dark;
          // Нижняя часть слоя темнее — у оверкаста есть вертикальный профиль.
          const shadeT = Math.max(0, row / layer.height - 0.55) * 1.4;
          if (shadeT > 0) color = mixColor(color, dark, Math.min(1, shadeT));
          surface.pixel(x, screenY, color);
          continue;
        }

        if (layer.values[rowStart + index] <= threshold) continue;

        const above1 = layer.values[rowStart - layer.width + index];
        const above2 = layer.values[rowStart - layer.width * 2 + index];
        const below1 = layer.values[rowStart + layer.width + index];
        const below2 = layer.values[rowStart + layer.width * 2 + index];

        const edgeTop = above1 <= threshold || above2 <= threshold;
        const edgeBottom = below1 <= threshold || below2 <= threshold;

        let color = body;
        if (lightFromBelow) {
          if (edgeBottom) color = rim;
          else if (edgeTop) color = dark;
        } else if (edgeBottom) {
          color = dark;
        } else if (edgeTop) {
          color = rim;
        }

        surface.pixel(x, screenY, color);
      }
    }
  }
}
