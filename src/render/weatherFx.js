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
  const color = shade(snowing ? SNOW_COLOR : RAIN_COLOR, Math.max(0.3, light));
  const seconds = timeMs / 1000;
  const wind = Math.min(2.4, windKmh / 22);
  const spanX = surface.width + 40;
  const spanY = surface.height + 24;

  for (let index = 0; index < count; index += 1) {
    const baseX = hash2(index, 1, 3) * spanX;
    const baseY = hash2(index, 2, 7) * spanY;
    const speed = 0.7 + hash2(index, 3, 11) * 0.6;
    const phase = hash2(index, 4, 13) * Math.PI * 2;

    const x = wrap(baseX + seconds * config.fall * (0.4 + wind) + Math.sin(seconds * 2 + phase) * (snowing ? 4 : 1), spanX) - 20;
    const y = wrap(baseY + seconds * config.fall * speed, spanY) - 12;

    if (precip.type === 'rain' || precip.type === 'drizzle') {
      // Штрих под углом ветра: чем сильнее ветер, тем более наклонный.
      const slant = Math.max(1, Math.round(config.size * wind));
      surface.line(
        Math.round(x + slant),
        Math.round(y + config.size),
        Math.round(x),
        Math.round(y),
        color,
      );
    } else {
      const size = hash2(index, 5, 17) > 0.85 ? 2 : 1;
      // В метель снежинка летит почти горизонтально — рисуем штрих по ветру.
      const streak = wind > 0.45 && size === 1 ? Math.min(4, 1 + Math.round(wind * 1.6)) : size;
      surface.fillRect(Math.round(x), Math.round(y), streak, size, color);
    }
  }
}

/**
 * Туман: мягкое выцветание контраста, сильнее у земли.
 * Сначала полупрозрачный слой (veil), потом разреженные «клочья» дизерингом.
 * @param {import('./surface.js').Surface} surface
 * @param {number} fog 0…1
 * @param {number} light
 */
function drawFog(surface, fog, light) {
  if (fog < 0.03) return;

  const color = shade(FOG_COLOR, Math.max(0.5, light));
  const top = Math.max(0, Math.round(HORIZON_Y - 70));

  for (let y = top; y < surface.height; y += 1) {
    const depth = (y - top) / Math.max(1, surface.height - top);
    const alpha = fog * (0.05 + depth ** 1.6 * 1.15);
    if (alpha <= 0.01) continue;

    surface.veil(0, y, surface.width, 1, withAlpha(color, Math.round(Math.min(0.92, alpha) * 255)));
  }
}

/**
 * Вспышка грозы: короткая, затухающая, раз в несколько секунд.
 * @param {import('./surface.js').Surface} surface
 * @param {number} timeMs
 * @param {object} palette
 */
function drawFlash(surface, timeMs, palette) {
  const slot = Math.floor(timeMs / 1400);
  const chance = hash2(slot, 9, 5);

  if (chance > 0.34) return;

  const local = (timeMs % 1400) / 1400;
  if (local > 0.22) return;

  const power = 1 - local / 0.22;
  const color = mixColor(palette.cloudLight, FLASH_COLOR, 0.7);

  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (bayerThreshold(x, y) < power * 0.55) surface.pixel(x, y, color);
    }
  }
}

/**
 * Все погодные эффекты поверх сцены.
 * @param {import('./surface.js').Surface} surface
 * @param {object} conditions результат sceneConditions
 * @param {{timeMs: number, windKmh: number, palette: object}} options
 */
export function drawWeather(surface, conditions, { timeMs, windKmh, palette }) {
  const light = palette?.light ?? 1;

  drawPrecipitation(surface, conditions.precip, { timeMs, windKmh, light });
  drawFog(surface, conditions.fog, light);

  if (conditions.storm) drawFlash(surface, timeMs, palette);
}
