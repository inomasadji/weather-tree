// Снапшоты сцены: PNG для глаз и хеши кадров для golden-тестов.
// Использование: node tools/snapshot.mjs [--bench] [--scale 4]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { decodePng, encodePng } from './png.mjs';
import { Surface } from '../src/render/surface.js';
import { renderScene } from '../src/render/scene.js';
import { hexColor } from '../src/render/color.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';
import { LOGICAL } from '../src/config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'snapshots', 'out');
const GOLDEN_DIR = join(ROOT, 'snapshots', 'golden');

const DIFF_UNCHANGED = hexColor('#141821');
const DIFF_CHANGED = hexColor('#ff2fa0');

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173, timeZone: 'Europe/Moscow' };
const MURMANSK = { name: 'Мурманск', country: 'Россия', lat: 68.9585, lon: 33.0827, timeZone: 'Europe/Moscow' };
const SYDNEY = { name: 'Сидней', country: 'Австралия', lat: -33.8688, lon: 151.2093, timeZone: 'Australia/Sydney' };

/** Сценарии из docs/WEATHER-MAPPING.md. */
export const SCENARIOS = [
  {
    name: 'm3-july-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 6, 9, 9, 0),
    weather: { tempC: 24, code: 0, cloudPct: 5, windKmh: 4 },
  },
  {
    name: 'm3-january-night',
    place: MOSCOW,
    atMs: Date.UTC(2026, 0, 14, 16, 15),
    weather: { tempC: -11, code: 75, cloudPct: 95, windKmh: 28, gustKmh: 45 },
  },
  {
    name: 'm3-sunset',
    place: MOSCOW,
    atMs: Date.UTC(2026, 4, 3, 16, 40),
    weather: { tempC: 9, code: 2, cloudPct: 35, windKmh: 12 },
  },
  {
    name: 'm3-polar-night',
    place: MURMANSK,
    atMs: Date.UTC(2026, 11, 22, 10, 0),
    weather: { tempC: -8, code: 3, cloudPct: 80, windKmh: 6 },
  },
  {
    name: 'm3-sydney-noon',
    place: SYDNEY,
    atMs: Date.UTC(2026, 0, 15, 1, 0),
    weather: { tempC: 28, code: 0, cloudPct: 10, windKmh: 10 },
  },
  {
    name: 'm5-rain',
    place: MOSCOW,
    atMs: Date.UTC(2026, 9, 21, 14, 40),
    weather: { tempC: 7, code: 61, cloudPct: 90, windKmh: 15, humidity: 88 },
  },
  {
    name: 'm5-fog',
    place: MOSCOW,
    atMs: Date.UTC(2026, 10, 13, 18, 0),
    weather: { tempC: 2, code: 45, cloudPct: 100, windKmh: 3, humidity: 98 },
  },
  {
    name: 'm5-storm',
    place: MOSCOW,
    atMs: Date.UTC(2026, 6, 9, 15, 0),
    weather: { tempC: 22, code: 95, cloudPct: 100, windKmh: 45, gustKmh: 70, humidity: 80 },
  },
  // M11: год по месяцам — полдень по Москве (UTC+3), кроме июля (уже есть выше).
  {
    name: 'm11-january-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 0, 15, 9, 0),
    weather: { tempC: -7, code: 1, cloudPct: 25, windKmh: 6 },
  },
  {
    name: 'm11-march-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 2, 15, 9, 0),
    weather: { tempC: 2, code: 3, cloudPct: 70, windKmh: 14 },
  },
  {
    name: 'm11-may-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 4, 15, 9, 0),
    weather: { tempC: 18, code: 2, cloudPct: 40, windKmh: 11 },
  },
  {
    name: 'm11-september-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 8, 15, 9, 0),
    weather: { tempC: 13, code: 61, cloudPct: 85, windKmh: 17, humidity: 82 },
  },
  {
    name: 'm11-november-noon',
    place: MOSCOW,
    atMs: Date.UTC(2026, 10, 15, 9, 0),
    weather: { tempC: -2, code: 71, cloudPct: 90, windKmh: 9, humidity: 88 },
  },
  // M11: редкие состояния — полярный день, синий час, мокрый снег.
  {
    name: 'm11-polar-day',
    place: MURMANSK,
    atMs: Date.UTC(2026, 5, 21, 9, 0),
    weather: { tempC: 12, code: 1, cloudPct: 30, windKmh: 8 },
  },
  {
    name: 'm11-blue-hour',
    place: MOSCOW,
    atMs: Date.UTC(2026, 6, 20, 18, 50),
    weather: { tempC: 17, code: 1, cloudPct: 20, windKmh: 5 },
  },
  {
    name: 'm11-wet-snow',
    place: MOSCOW,
    atMs: Date.UTC(2026, 10, 20, 6, 0),
    weather: { tempC: 0, code: 68, cloudPct: 95, windKmh: 12, humidity: 92 },
  },
];

/**
 * @param {{place: object, atMs: number, weather: object}} scenario
 * @returns {{world: object, atMs: number}}
 */
export function scenarioWorld(scenario) {
  const station = demoStation(scenario.place, {
    atMs: scenario.atMs,
    weather: scenario.weather,
  });

  return {
    world: buildWorldState(station, scenario.atMs),
    atMs: scenario.atMs,
  };
}

function upscale(source, factor) {
  const result = new Surface(source.width * factor, source.height * factor);

  for (let y = 0; y < result.height; y += 1) {
    const sourceRow = Math.floor(y / factor) * source.width;
    const targetRow = y * result.width;
    for (let x = 0; x < result.width; x += 1) {
      result.pixels[targetRow + x] = source.pixels[sourceRow + Math.floor(x / factor)];
    }
  }

  return result;
}

export function hashOf(surface) {
  return createHash('sha256').update(surface.data).digest('hex').slice(0, 16);
}

/**
 * Кадр сценария на свежем буфере.
 * @param {{name: string, place: object, atMs: number, weather: object}} scenario
 * @param {Surface} [surface]
 * @returns {Surface}
 */
export function renderScenario(scenario, surface = new Surface(LOGICAL.width, LOGICAL.height)) {
  const { world, atMs } = scenarioWorld(scenario);
  renderScene(surface, world, atMs, atMs);
  return surface;
}

/** @param {string} name */
export function goldenFile(name) {
  return join(GOLDEN_DIR, `${name}.png`);
}

/**
 * Эталонный кадр из репозитория.
 * @param {string} name
 * @returns {{width: number, height: number, data: Uint8ClampedArray}|null}
 */
export function readGolden(name) {
  const file = goldenFile(name);
  if (!existsSync(file)) return null;
  return decodePng(readFileSync(file));
}

/**
 * @param {string} name
 * @param {Surface} surface
 */
export function writeGolden(name, surface) {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(goldenFile(name), encodePng(surface.width, surface.height, surface.data));
}

/**
 * Попиксельное сравнение кадров. Возвращает точное число различий,
 * их долю и карту различий (для глаза), а не только «хеш не совпал».
 * @param {{width: number, height: number, data: Uint8ClampedArray}} actual
 * @param {{width: number, height: number, data: Uint8ClampedArray}} expected
 * @returns {{total: number, changed: number, ratio: number, map: Surface,
 *            box: {x0: number, y0: number, x1: number, y1: number}|null}}
 */
export function diffSurfaces(actual, expected) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `размеры кадров не совпадают: ${actual.width}×${actual.height} vs ${expected.width}×${expected.height}`,
    );
  }

  const total = actual.width * actual.height;
  const map = new Surface(actual.width, actual.height);
  let changed = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };

  for (let y = 0; y < actual.height; y += 1) {
    for (let x = 0; x < actual.width; x += 1) {
      const index = (y * actual.width + x) * 4;
      const same =
        actual.data[index] === expected.data[index] &&
        actual.data[index + 1] === expected.data[index + 1] &&
        actual.data[index + 2] === expected.data[index + 2] &&
        actual.data[index + 3] === expected.data[index + 3];

      if (same) {
        map.pixel(x, y, DIFF_UNCHANGED);
        continue;
      }

      changed += 1;
      map.pixel(x, y, DIFF_CHANGED);
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
  }

  return {
    total,
    changed,
    ratio: changed / total,
    map,
    box: changed > 0 ? box : null,
  };
}

/**
 * Карта различий крупным планом, чтобы глазами видеть, где поехал кадр.
 * @param {string} name
 * @param {Surface} map
 * @returns {string} путь к файлу
 */
export function saveDiff(name, map, factor = 3) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `diff-${name}.png`);
  writeFileSync(file, encodePng(map.width * factor, map.height * factor, upscale(map, factor).data));
  return file;
}

/** @param {string} name @param {Surface} surface */
function save(name, surface) {
  const file = join(OUT_DIR, `${name}.png`);
  writeFileSync(file, encodePng(surface.width, surface.height, surface.data));
  return file;
}

function main() {
  const argv = process.argv.slice(2);
  const scaleArg = argv.indexOf('--scale');
  const scale = scaleArg > -1 ? Math.max(1, Number(argv[scaleArg + 1]) || 4) : 4;
  const update = argv.includes('--update');

  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  mkdirSync(OUT_DIR, { recursive: true });

  let mismatches = 0;

  for (const scenario of SCENARIOS) {
    renderScenario(scenario, surface);

    save(scenario.name, surface);
    save(`${scenario.name}@${scale}x`, upscale(surface, scale));

    if (update) {
      writeGolden(scenario.name, surface);
      console.log(`${scenario.name.padEnd(22)} ${hashOf(surface)} эталон перезаписан`);
      continue;
    }

    const expected = readGolden(scenario.name);
    if (!expected) {
      mismatches += 1;
      console.log(`${scenario.name.padEnd(22)} ${hashOf(surface)} эталона нет — запустите с --update`);
      continue;
    }

    const diff = diffSurfaces(surface, expected);
    if (diff.changed > 0) {
      mismatches += 1;
      const file = saveDiff(scenario.name, diff.map);
      const box = diff.box;
      console.log(
        `${scenario.name.padEnd(22)} ${diff.changed} px из ${diff.total} ` +
          `(${(diff.ratio * 100).toFixed(2)}%), область x${box.x0}..${box.x1} y${box.y0}..${box.y1} → ${file}`,
      );
      continue;
    }

    console.log(`${scenario.name.padEnd(22)} ${hashOf(surface)} совпадает с эталоном`);
  }

  if (argv.includes('--bench')) {
    const { world, atMs } = scenarioWorld(SCENARIOS[2]);
    const times = [];

    for (let index = 0; index < 200; index += 1) {
      const started = performance.now();
      renderScene(surface, world, atMs, atMs + index * 16);
      times.push(performance.now() - started);
    }

    times.sort((a, b) => a - b);
    console.log(
      `рендер x200: медиана ${times[100].toFixed(2)} мс, ` +
        `p95 ${times[190].toFixed(2)} мс, максимум ${times[199].toFixed(2)} мс`,
    );
  }

  console.log(`картинки: ${OUT_DIR}`);
  if (mismatches > 0 && !update) {
    console.log(`расхождений с эталонами: ${mismatches} — если это намеренно, запустите с --update`);
    process.exitCode = 1;
  }
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
