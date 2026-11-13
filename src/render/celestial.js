// Светила: положение на дуге, солнце с гало, луна с фазой.

import { HORIZON_Y } from '../config.js';
import { bayerThreshold } from './surface.js';

/**
 * Куда поставить светило: часовой угол даёт X (слева восход, справа закат),
 * высота — Y. Так работает в обоих полушариях без доп. условий.
 * @param {import('./surface.js').Surface} surface
 * @param {number} hourAngleDeg −180…180
 * @param {number} altitudeDeg
 * @returns {{x: number, y: number}}
 */
export function celestialPoint(surface, hourAngleDeg, altitudeDeg) {
  return {
    x: Math.round(surface.width / 2 + (hourAngleDeg / 90) * (surface.width * 0.46)),
    y: Math.round(HORIZON_Y - (altitudeDeg / 90) * (HORIZON_Y - 12)),
  };
}

/**
 * Гало: плотность точек падает от диска к краю.
 * @param {import('./surface.js').Surface} surface
 * @param {number} cx @param {number} cy
 * @param {number} inner @param {number} outer
 * @param {number} color @param {number} density
 */
function halo(surface, cx, cy, inner, outer, color, density) {
  for (let y = cy - outer; y <= cy + outer; y += 1) {
    for (let x = cx - outer; x <= cx + outer; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > outer || distance <= inner) continue;

      const fade = 1 - (distance - inner) / (outer - inner);
      if (bayerThreshold(x, y) < fade * density) surface.pixel(x, y, color);
    }
  }
}

/**
 * @param {import('./surface.js').Surface} surface
 * @param {{x: number, y: number, palette: object, altitudeDeg: number}} options
 */
export function drawSun(surface, { x, y, palette, altitudeDeg }) {
  if (altitudeDeg < -2) return;

  // Низкое солнце крупнее и «мягче» — так читается закат.
  const core = altitudeDeg > 12 ? 7 : 8;
  halo(surface, x, y, core, core + 14, palette.sunHalo, Math.max(0.25, 0.55 - altitudeDeg / 90));

  surface.circle(x, y, core + 2, palette.sunEdge);
  surface.circle(x, y, core, palette.sunCore);
}

/**
 * Фаза рисуется как два диска: теневой и освещённый со сдвигом —
 * чем больше сдвиг, тем тоньше серп. Днём луну не рисуем: тёмный диск
 * на голубом небе читается как дырка.
 * @param {import('./surface.js').Surface} surface
 * @param {{x: number, y: number, palette: object, phase: number, altitudeDeg: number, sunAltitudeDeg: number}} options
 */
export function drawMoon(surface, { x, y, palette, phase, altitudeDeg, sunAltitudeDeg }) {
  if (altitudeDeg < -2 || sunAltitudeDeg > 2) return;

  const radius = 7;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const direction = phase < 0.5 ? 1 : -1;
  const shift = Math.round(2 * radius * (1 - illumination));

  if (illumination < 0.95) halo(surface, x, y, radius, radius + 9, palette.moonLit, 0.18);

  surface.circle(x, y, radius, palette.moonShadow);
  surface.circle(x + direction * shift, y, radius, palette.moonLit);
}
