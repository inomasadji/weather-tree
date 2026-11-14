// Погодные эффекты: снег, крупа, дождь, морось, туман, вспышки грозы.
// Частицы не хранят состояние: позиция — функция времени и сида,
// поэтому кадр детерминирован и переживает перезагрузку без «прыжков».

import { hexColor, mixColor, withAlpha } from './color.js';
import { hash2 } from './noise.js';
import { HORIZON_Y } from '../config.js';
import { shade } from '../model/palette.js';
import { bayerThreshold } from './surface.js';

const PRECIP = {
  snow: { count: 260, fall: 30, drift: 0.75, size: 2 },
  grains: { count: 300, fall: 80, drift: 1.15, size: 2 },
  rain: { count: 230, fall: 250, drift: 0.5, size: 4 },
  drizzle: { count: 120, fall: 120, drift: 0.35, size: 2 },
};

const SNOW_COLOR = hexColor('#eef6ff');
const RAIN_COLOR = hexColor('#a9c3dd');
const FOG_COLOR = hexColor('#cfdde8');
const FLASH_COLOR = hexColor('#dfe9ff');

/** @param {number} value @param {number} max */
const wrap = (value, max) => ((value % max) + max) % max;

/**
 * Осадки.
 * @param {import('./surface.js').Surface} surface
 * @param {object} precip результат classifyPrecipitation
 * @param {{timeMs: number, windKmh: number, light: number}} options
 */
function drawPrecipitation(surface, precip, { timeMs, windKmh, light }) {
  const config = PRECIP[precip.type];
  if (!config) return;

  const snowing = precip.type === 'snow' || precip.type === 'grains';
  const count = Math.round(config.count * (0.45 + precip.intensity * 0.75));
  const nearColor = shade(snowing ? SNOW_COLOR : RAIN_COLOR, Math.max(0.3, light));
  const farColor = shade(snowing ? SNOW_COLOR : RAIN_COLOR, Math.max(0.2, light * 0.72));
  const seconds = timeMs / 1000;
  const wind = Math.min(2.4, windKmh / 22);
  const spanX = surface.width + 40;
  const spanY = surface.height + 24;

  for (let index = 0; index < count; index += 1) {
    // Два плана глубины: дальний слой (треть частиц) мельче, медленнее и приглушён.
    const isFar = index % 3 === 0;
    const depthSpeed = isFar ? 0.72 : 1.1;
    const color = isFar ? farColor : nearColor;
    const baseX = hash2(index, 1, 3) * spanX;
    const baseY = hash2(index, 2, 7) * spanY;
    const speed = (0.7 + hash2(index, 3, 11) * 0.6) * depthSpeed;
    const phase = hash2(index, 4, 13) * Math.PI * 2;

    const x = wrap(baseX + seconds * config.fall * depthSpeed * (0.4 + wind) + Math.sin(seconds * 2 + phase) * (snowing ? 4 : 1), spanX) - 20;
    const y = wrap(baseY + seconds * config.fall * speed, spanY) - 12;

    if (precip.type === 'rain' || precip.type === 'drizzle') {
      const size = isFar ? Math.max(1, config.size - 1) : config.size;
      const slant = Math.max(1, Math.round(size * wind));
      surface.line(
        Math.round(x + slant),
        Math.round(y + size),
        Math.round(x),
        Math.round(y),
        color,
      );
    } else {
      const size = !isFar && hash2(index, 5, 17) > 0.85 ? 2 : 1;
      const streak = !isFar && wind > 0.45 && size === 1 ? Math.min(4, 1 + Math.round(wind * 1.6)) : size;
      surface.fillRect(Math.round(x), Math.round(y), streak, size, color);
    }
  }
}

/**
 * Туман: мягкое выцветание контраста по всей высоте, сильнее у земли.
 * Крона и облака тоже тонут в дымке — иначе дерево «вне тумана».
 * @param {import('./surface.js').Surface} surface
 * @param {number} fog 0…1
 * @param {number} light
 */
function drawFog(surface, fog, light) {
  if (fog < 0.03) return;

  const color = shade(FOG_COLOR, Math.max(0.5, light));
  const maxDepth = Math.max(1, surface.height - 1);

  for (let y = 0; y < surface.height; y += 1) {
    const depth = y / maxDepth;
    const alpha = fog * (0.04 + depth ** 1.7 * 0.95);
    if (alpha <= 0.01) continue;

    surface.veil(0, y, surface.width, 1, withAlpha(color, Math.round(Math.min(0.92, alpha) * 255)));
  }
}

/**
 * Молния: ломаная от облака к земле с ответвлениями.
 * @param {import('./surface.js').Surface} surface
 * @param {number} slot
 * @param {number} color
 * @param {number} horizonY
 */
function drawBolt(surface, slot, color, horizonY) {
  let x = 12 + hash2(slot, 1, 29) * (surface.width - 24);
  let y = 6;
  const endY = horizonY + 4;

  while (y < endY) {
    const stepY = 7 + hash2(slot, Math.round(y), 33) * 9;
    const nextX = x + (hash2(slot, Math.round(y), 31) - 0.5) * 20;
    const nextY = Math.min(endY, y + stepY);

    surface.line(Math.round(x), Math.round(y), Math.round(nextX), Math.round(nextY), color);

    if (hash2(slot, Math.round(y), 37) < 0.3) {
      const branchX = nextX + (hash2(slot, Math.round(y), 39) - 0.5) * 26;
      surface.line(
        Math.round(nextX),
        Math.round(nextY),
        Math.round(branchX),
        Math.round(nextY + 6),
        color,
      );
    }

    x = nextX;
    y = nextY;
  }
}

/**
 * Вспышка грозы: разряд и короткая засветка, раз в несколько секунд.
 * @param {import('./surface.js').Surface} surface
 * @param {number} timeMs
 * @param {object} palette
 */
function drawFlash(surface, timeMs, palette, horizonY) {
  const slot = Math.floor(timeMs / 1400);
  const chance = hash2(slot, 9, 5);

  if (chance > 0.34) return;

  const local = (timeMs % 1400) / 1400;
  if (local > 0.22) return;

  const power = 1 - local / 0.22;

  // Сам разряд виден только в первые кадры — как настоящая молния.
  if (local < 0.12) {
    drawBolt(surface, slot, mixColor(palette.cloudRim, hexColor('#ffffff'), 0.75), horizonY);
  }
  const color = mixColor(palette.cloudLight, FLASH_COLOR, 0.7);

  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (bayerThreshold(x, y) < power * 0.25) surface.pixel(x, y, color);
    }
  }
}

/**
 * Мокрый грунт: затемнение, лужи с отражением неба и брызги от капель.
 * Рисуется сразу после земли, до дерева — лужи не должны наезжать на ствол.
 * @param {import('./surface.js').Surface} surface
 * @param {object} conditions результат sceneConditions
 * @param {{palette: object, timeMs: number}} options
 */
export function drawGroundWetness(surface, conditions, { palette, timeMs, horizonY = HORIZON_Y, windKmh = 0 }) {
  // Диагональные снежные перемёты в метель (2:1).
  if (conditions.snowCover > 0.35 && windKmh > 18) {
    const driftColor = palette.land.snowLight;
    const spanY = Math.max(8, surface.height - horizonY - 8);
    for (let i = 0; i < 6; i += 1) {
      const x0 = Math.round(hash2(i, 8, 53) * (surface.width - 28));
      const y0 = Math.round(horizonY + 6 + hash2(i, 9, 53) * spanY);
      const len = 10 + Math.round(hash2(i, 10, 53) * 14);
      for (let dx = 0; dx < len; dx += 1) {
        surface.pixel(x0 + dx, y0 + Math.floor(dx / 2), driftColor);
      }
    }
  }

  const wetness = conditions.wetness;
  if (wetness < 0.05) return;

  const width = surface.width;
  const top = horizonY;
  const rim = shade(palette.cloudRim, Math.max(0.3, palette.light));

  // Мокрый грунт темнее сухого.
  surface.veil(
    0,
    top,
    width,
    surface.height - top,
    withAlpha(mixColor(palette.land.ground, hexColor('#0a1220'), 0.45), Math.round(wetness * 150)),
  );

  // Лужи в 2.5D-ракурсе: дальние узкие, ближние шире и выше.
  const reflection = mixColor(
    mixColor(palette.sky[1] ?? palette.sky[0], palette.land.ground, 0.45),
    hexColor('#0a1220'),
    0.15,
  );

  const spanY = Math.max(12, surface.height - top - 10);
  const puddleStep = Math.max(24, (width - 72) / 4);
  for (let index = 0; index < 5; index += 1) {
    const depth = 0.14 + hash2(index, 2, 61) * 0.68;
    const cx = Math.round(18 + index * puddleStep + hash2(index, 1, 61) * 26);
    const cy = Math.round(top + 4 + depth * spanY);
    const rx = Math.round(5 + depth * 9 + hash2(index, 3, 61) * 4);
    const ry = Math.max(1, Math.round(rx * (0.2 + depth * 0.2)));

    surface.ellipse(cx, cy, rx, ry, reflection);

    for (let ripple = 0; ripple < 2; ripple += 1) {
      const phase = (timeMs / 1300 + index * 0.37 + ripple * 0.5) % 1;
      const half = Math.round(rx * (0.25 + phase * 0.7));
      surface.fillRect(cx - half, cy - (ry > 2 ? 1 : 0), 2 + Math.round((1 - phase) * 3), 1, rim);
    }
  }

  // Брызги: короткие вертикальные штрихи у земли.
  if (conditions.precip.type === 'rain' || conditions.precip.type === 'drizzle') {
    const splashCount = Math.max(8, Math.round(22 * (width / 320)));
    for (let index = 0; index < splashCount; index += 1) {
      const x = Math.round(hash2(index, 5, 67) * width);
      const baseY = Math.round(top + 2 + hash2(index, 6, 67) * 10);
      const phase = (timeMs / 420 + hash2(index, 7, 67)) % 1;
      if (phase > 0.3) continue;

      const height = Math.max(1, Math.round((1 - phase / 0.3) * 3));
      surface.fillRect(x, baseY - height, 1, height + 1, rim);
    }
  }
}

/**
 * Все погодные эффекты поверх сцены.
 * @param {import('./surface.js').Surface} surface
 * @param {object} conditions результат sceneConditions
 * @param {{timeMs: number, windKmh: number, palette: object, horizonY?: number}} options
 */
export function drawWeather(surface, conditions, { timeMs, windKmh, palette, horizonY = HORIZON_Y }) {
  const light = palette?.light ?? 1;

  drawPrecipitation(surface, conditions.precip, { timeMs, windKmh, light });
  drawFog(surface, conditions.fog, light);

  if (conditions.storm) drawFlash(surface, timeMs, palette, horizonY);
}
