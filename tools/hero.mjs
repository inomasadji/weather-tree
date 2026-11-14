// Витринные кадры для docs: тот же рендер, но крупный целый апскейл (×6 → 1920×1080)
// и специально подобранные сцены. Не для тестов — для глаз.
// Использование: node tools/hero.mjs [--scale 6]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './png.mjs';
import { SCENARIOS, renderScenario, upscaleSurface } from './snapshot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'docs', 'screenshots');

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.7558, lon: 37.6173, timeZone: 'Europe/Moscow' };

/** Сцены подобраны под свет и воздух, а не под «проверку кода». */
export const HERO_SCENES = [  {
    // Низкое утреннее солнце: длинная тень, тёплая дымка, роса.
    name: 'hero-summer-dawn',
    place: MOSCOW,
    atMs: Date.UTC(2026, 6, 9, 1, 20),
    weather: { tempC: 16, code: 0, cloudPct: 8, windKmh: 5, humidity: 78 },
  },
  {
    // Зимние сумерки: иней, снег и тёплая полоса у горизонта.
    name: 'hero-winter-dusk',
    place: MOSCOW,
    atMs: Date.UTC(2026, 0, 14, 14, 40),
    weather: { tempC: -9, code: 71, cloudPct: 85, windKmh: 14, gustKmh: 22, humidity: 88 },
  },
  {
    // Осенний дождь: мокрый грунт, лужи, низкие тяжёлые облака.
    name: 'hero-autumn-rain',
    place: MOSCOW,
    atMs: Date.UTC(2026, 9, 5, 13, 20),
    weather: { tempC: 8, code: 61, cloudPct: 92, windKmh: 18, humidity: 90 },
  },
  {
    // Сияние: Мурманск, полярная ночь, Kp 7 — главный «вау»-кадр.
    name: 'hero-aurora',
    place: { name: 'Мурманск', country: 'Россия', lat: 68.9585, lon: 33.0827, timeZone: 'Europe/Moscow' },
    atMs: Date.UTC(2026, 11, 21, 18, 0),
    weather: { tempC: -12, code: 0, cloudPct: 5, windKmh: 3, humidity: 70 },
    kp: 7,
  },
];

/** Кадры для таблицы в README: имя файла → имя сценария из tools/snapshot.mjs. */
const README_FRAMES = [
  ['summer-noon', 'm3-july-noon'],
  ['winter-blizzard', 'm3-january-night'],
  ['sunset', 'm3-sunset'],
  ['fog', 'm5-fog'],
  ['storm', 'm5-storm'],
  ['rain', 'm5-rain'],
];

function main() {
  const argv = process.argv.slice(2);
  const scaleArg = argv.indexOf('--scale');
  const heroScale = scaleArg > -1 ? Math.max(1, Number(argv[scaleArg + 1]) || 6) : 6;

  mkdirSync(OUT_DIR, { recursive: true });

  for (const scene of HERO_SCENES) {
    const surface = renderScenario(scene);
    const big = upscaleSurface(surface, heroScale);
    const file = join(OUT_DIR, `${scene.name}.png`);

    writeFileSync(file, encodePng(big.width, big.height, big.data));
    console.log(`${scene.name.padEnd(20)} ${big.width}x${big.height} → ${file}`);
  }

  // Кадры для таблицы в README: те же сценарии, но ×4 — их шесть, важен размер репозитория.
  for (const [file, scenarioName] of README_FRAMES) {
    const scenario = SCENARIOS.find((item) => item.name === scenarioName);
    if (!scenario) continue;

    const big = upscaleSurface(renderScenario(scenario), 4);
    writeFileSync(join(OUT_DIR, `${file}.png`), encodePng(big.width, big.height, big.data));
    console.log(`${file.padEnd(20)} ${big.width}x${big.height} → README`);
  }
}

main();
