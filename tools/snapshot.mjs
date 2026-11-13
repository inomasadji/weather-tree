// Снапшоты сцены: PNG для глаз и хеш кадра для golden-тестов.
// Использование: node tools/snapshot.mjs [--bench] [--scale 4]

import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { encodePng } from './png.mjs';
import { Surface } from '../src/render/surface.js';
import { renderScene } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'snapshots', 'out');

const argv = process.argv.slice(2);
const scaleArg = argv.indexOf('--scale');
const SCALE = scaleArg > -1 ? Math.max(1, Number(argv[scaleArg + 1]) || 4) : 4;

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

function hashOf(surface) {
  return createHash('sha256').update(surface.data).digest('hex').slice(0, 16);
}

/** @param {string} name @param {Surface} surface */
function save(name, surface) {
  const file = join(OUT_DIR, `${name}.png`);
  writeFileSync(file, encodePng(surface.width, surface.height, surface.data));
  return file;
}

function bench(surface, iterations = 200) {
  const times = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    renderScene(surface);
    times.push(performance.now() - started);
  }

  times.sort((a, b) => a - b);
  return {
    iterations,
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.floor(times.length * 0.95)],
    max: times[times.length - 1],
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const surface = new Surface(LOGICAL.width, LOGICAL.height);
renderScene(surface);

const frameFile = save('m2-testcard', surface);
const zoomFile = save(`m2-testcard@${SCALE}x`, upscale(surface, SCALE));

console.log(`кадр:      ${frameFile}`);
console.log(`увеличение: ${zoomFile}`);
console.log(`хеш кадра:  ${hashOf(surface)}`);

if (argv.includes('--bench')) {
  const stats = bench(surface);
  console.log(
    `рендер x${stats.iterations}: медиана ${stats.median.toFixed(2)} мс, ` +
      `p95 ${stats.p95.toFixed(2)} мс, максимум ${stats.max.toFixed(2)} мс`,
  );
}
