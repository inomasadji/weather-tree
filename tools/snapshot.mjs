// Снапшоты сцены: PNG для глаз и хеши кадров для golden-тестов.
// Использование: node tools/snapshot.mjs [--bench] [--scale 4]

import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { encodePng } from './png.mjs';
import { Surface } from '../src/render/surface.js';
import { renderScene } from '../src/render/scene.js';
import { demoStation } from '../src/state/demo.js';
import { buildWorldState } from '../src/state/world.js';
import { LOGICAL } from '../src/config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'snapshots', 'out');

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

  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  mkdirSync(OUT_DIR, { recursive: true });

  for (const scenario of SCENARIOS) {
    const { world, atMs } = scenarioWorld(scenario);
    renderScene(surface, world, atMs, atMs);

    save(scenario.name, surface);
    save(`${scenario.name}@${scale}x`, upscale(surface, scale));
    console.log(`${scenario.name.padEnd(20)} ${hashOf(surface)}`);
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
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
