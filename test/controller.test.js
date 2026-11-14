import test from 'node:test';
import assert from 'node:assert/strict';

import { createWeatherController, humanReason } from '../src/state/controller.js';
import { demoStation } from '../src/state/demo.js';

const MOSCOW = { name: 'Москва', country: 'Россия', lat: 55.76, lon: 37.62, timeZone: 'Europe/Moscow' };

test('humanReason переводит известные причины ошибок', () => {
  assert.equal(humanReason('timeout'), 'сервис погоды не ответил');
  assert.equal(humanReason('http:429'), 'превышен лимит запросов');
  assert.equal(humanReason('custom'), 'custom');
});

test('startLive показывает нейтральный кадр, затем live-данные и сохраняет кэш', async () => {
  const worlds = [];
  const sources = [];
  const messages = [];
  const written = [];
  const station = { ...demoStation(MOSCOW), fetchedAt: Date.now(), provider: 'open-meteo' };

  const controller = createWeatherController({
    resolvePlace: async () => ({ place: MOSCOW, source: 'fallback' }),
    fetchWeather: async () => ({ ok: true, station }),
    readCache: () => null,
    writeCache: (value) => written.push(value),
    onWorld: (world, duration) => worlds.push({ known: world.weather.known, duration }),
    onSource: (source) => sources.push(source),
    onMessage: (message) => messages.push(message),
  });

  await controller.startLive();
  controller.dispose();

  assert.equal(worlds.length, 2);
  assert.deepEqual(worlds[0], { known: false, duration: 0 });
  assert.deepEqual(worlds[1], { known: true, duration: 2500 });
  assert.equal(sources[0], 'loading');
  assert.equal(written.length, 1);
  assert.equal(messages.at(-1), null);
});

test('loadWeather откатывается на кэш при ошибке сети', async () => {
  const cached = { ...demoStation(MOSCOW), fetchedAt: Date.now() - 60_000 };
  const sources = [];
  const messages = [];
  const stationSources = [];

  const controller = createWeatherController({
    resolvePlace: async () => ({ place: MOSCOW, source: 'saved' }),
    fetchWeather: async () => ({ ok: false, reason: 'network' }),
    readCache: () => cached,
    writeCache: () => {},
    onSource: (source) => sources.push(source),
    onStation: (_, meta) => stationSources.push(meta.source),
    onMessage: (message) => messages.push(message),
  });

  await controller.startLive();
  controller.dispose();

  assert.equal(stationSources.includes('cache'), true);
  assert.match(messages.at(-1), /Показаны последние данные/);
});

test('startDemo не ходит в сеть и помечает demoMode', () => {
  let fetched = 0;
  const stationSources = [];

  const controller = createWeatherController({
    fetchWeather: async () => {
      fetched += 1;
      return { ok: false, reason: 'network' };
    },
    onStation: (_, meta) => stationSources.push(meta.source),
  });

  controller.startDemo({ place: MOSCOW, atMs: Date.UTC(2026, 6, 9, 9, 0), overrides: { tempC: 24 } });
  controller.refreshIfDue();
  controller.dispose();

  assert.equal(fetched, 0);
  assert.equal(controller.state.demoMode, true);
  assert.deepEqual(stationSources, ['demo']);
});
