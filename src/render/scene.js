// Сцена M2 — «тест-карта» пиксельного рантайма: небо, солнце, холмы, земля.
// Реальная сцена (сезон, сутки, погода, дерево) заменит её в M3–M5;
// пока важно, что буфер, палитра и дизеринг работают.

import { hexColor } from './color.js';
import { Surface, bayerThreshold } from './surface.js';

/** Линия горизонта в логических пикселях. */
export const HORIZON = 118;

const C = {
  skyTop: hexColor('#4f86c6'),
  skyMid: hexColor('#8fb6d9'),
  skyLow: hexColor('#cfe3ef'),
  haze: hexColor('#e8f3f9'),
  sunCore: hexColor('#fff6cf'),
  sunEdge: hexColor('#f7d489'),
  sunHalo: hexColor('#e9d9a0'),
  hillFar: hexColor('#6d8f9a'),
  hillNear: hexColor('#4a6b5c'),
  ground: hexColor('#33503a'),
  groundDark: hexColor('#263c2a'),
  groundLight: hexColor('#3f6440'),
  seam: hexColor('#3a5a3d'),
};

/**
 * Диск с растворяющимся краем: плотность точек падает от rInner к rOuter.
 * @param {Surface} surface
 * @param {number} cx @param {number} cy
 * @param {number} rInner @param {number} rOuter
 * @param {number} color @param {number} density
 */
function ditheredDisc(surface, cx, cy, rInner, rOuter, color, density) {
  for (let y = cy - rOuter; y <= cy + rOuter; y += 1) {
    for (let x = cx - rOuter; x <= cx + rOuter; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > rOuter || distance <= rInner) continue;

      const fade = 1 - (distance - rInner) / (rOuter - rInner);
      if (bayerThreshold(x, y) < fade * density) surface.pixel(x, y, color);
    }
  }
}

/**
 * Скалистый гребень: две синусоиды дают «неровный» силуэт без ассетов.
 * @param {Surface} surface
 * @param {{base: number, amplitude: number, period: number, phase: number, color: number, bottom: number}} options
 */
function ridge(surface, { base, amplitude, period, phase, color, bottom }) {
  for (let x = 0; x < surface.width; x += 1) {
    const y = Math.round(
      base +
        Math.sin((x + phase) / period) * amplitude +
        Math.sin((x + phase) / (period / 3.7)) * amplitude * 0.4,
    );
    surface.fillRect(x, y, 1, bottom - y, color);
  }
}

/**
 * @param {Surface} surface
 */
export function renderScene(surface) {
  const { width, height } = surface;

  // Небо: три стопа, разбитых на полосы — стыки «сшиты» дизерингом Байера.
  surface.gradientV(0, 0, width, HORIZON, [
    { at: 0, color: C.skyTop },
    { at: 0.55, color: C.skyMid },
    { at: 1, color: C.skyLow },
  ], { bands: 10 });

  // Дымка у горизонта — до холмов, иначе белые точки лягут на тёмный силуэт.
  for (let y = HORIZON - 5; y < HORIZON; y += 1) {
    const density = ((y - (HORIZON - 6)) / 6) * 0.5;
    for (let x = 0; x < width; x += 1) {
      if (bayerThreshold(x, y) < density) surface.pixel(x, y, C.haze);
    }
  }

  // Солнце: ядро, кромка и растворяющееся гало.
  ditheredDisc(surface, 238, 32, 13, 26, C.sunHalo, 0.55);
  surface.circle(238, 32, 13, C.sunEdge);
  surface.circle(238, 32, 10, C.sunCore);

  // Дальние и ближние холмы.
  ridge(surface, { base: 96, amplitude: 9, period: 46, phase: 20, color: C.hillFar, bottom: 132 });
  ridge(surface, { base: 106, amplitude: 6, period: 29, phase: 90, color: C.hillNear, bottom: 134 });

  // Земля.
  surface.fillRect(0, HORIZON, width, height - HORIZON, C.ground);

  // Текстура травы: детерминированный шум, а не Math.random().
  for (let y = HORIZON + 2; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Surface.noise(x, y, 7);
      if (noise > 0.955) surface.pixel(x, y, C.groundLight);
      else if (noise < 0.045) surface.pixel(x, y, C.groundDark);
    }
  }

  // Несколько кустиков травы у горизонта — чтобы край не был линейкой.
  for (let index = 0; index < 26; index += 1) {
    const x = Math.round(Surface.noise(index, 1, 31) * width);
    const bladeHeight = 1 + Math.round(Surface.noise(index, 2, 31) * 2);
    surface.fillRect(x, HORIZON - bladeHeight, 1, bladeHeight, C.groundLight);
  }
}
