import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPrecipitation,
  dryingWetness,
  rimeLoad,
  sceneConditions,
  windAmplitude,
} from '../src/model/conditions.js';

test('ясная погода — без осадков', () => {
  assert.equal(classifyPrecipitation(0, 20).type, 'none');
  assert.equal(classifyPrecipitation(3, 5).type, 'none');
  assert.equal(classifyPrecipitation(-1, 5).type, 'none');
});

test('дождь, ливень и морось различаются по интенсивности', () => {
  assert.equal(classifyPrecipitation(61, 15).type, 'rain');
  assert.ok(classifyPrecipitation(65, 15).intensity > classifyPrecipitation(61, 15).intensity);
  assert.equal(classifyPrecipitation(51, 15).type, 'drizzle');
});

test('снег и крупа', () => {
  assert.equal(classifyPrecipitation(71, -5).type, 'snow');
  assert.equal(classifyPrecipitation(77, -5).type, 'grains');
});

test('ледяной дождь при морозе превращается в снег', () => {
  assert.equal(classifyPrecipitation(66, -5).type, 'snow');
  assert.equal(classifyPrecipitation(66, 6).type, 'rain');
});

test('гроза помечается отдельно', () => {
  const storm = classifyPrecipitation(95, 18);
  assert.equal(storm.storm, true);
  assert.ok(storm.intensity > 0.7);
});

test('амплитуда качания растёт с ветром', () => {
  const calm = windAmplitude(2);
  const breeze = windAmplitude(15);
  const strong = windAmplitude(40);
  const storm = windAmplitude(70, 90);

  assert.ok(calm < 0.05);
  assert.ok(breeze > calm);
  assert.ok(strong > breeze);
  assert.ok(storm > strong);
  assert.ok(storm <= 1);
});

test('порывы усиливают качание', () => {
  assert.ok(windAmplitude(10, 60) > windAmplitude(10, 0));
});

/** @param {object} weather */
function worldWith(weather) {
  return {
    weather: {
      code: 0,
      tempC: 10,
      humidity: 60,
      windKmh: 4,
      gustKmh: 6,
      ...weather,
    },
  };
}

test('снегопад даёт снег на земле и на ветвях', () => {
  const conditions = sceneConditions(worldWith({ code: 75, tempC: -11, windKmh: 28 }));

  assert.equal(conditions.snowing, true);
  assert.ok(conditions.snowCover > 0.8, `покров ${conditions.snowCover}`);
  assert.ok(conditions.snowLoad > 0.5, `снег на ветвях ${conditions.snowLoad}`);
  assert.ok(conditions.windAmp > 0.4);
});

test('мороз без осадков оставляет старый снег', () => {
  const conditions = sceneConditions(worldWith({ code: 0, tempC: -8 }));
  assert.ok(conditions.snowCover > 0.4);
  assert.ok(conditions.snowLoad < 0.3);
});

test('дождь мочит ствол, снега нет', () => {
  const conditions = sceneConditions(worldWith({ code: 63, tempC: 12 }));
  assert.equal(conditions.snowing, false);
  assert.ok(conditions.wetness > 0.3);
  assert.equal(conditions.snowCover, 0);
});

test('туман определяется по коду и влажности', () => {
  assert.ok(sceneConditions(worldWith({ code: 45 })).fog > 0.5);
  assert.ok(sceneConditions(worldWith({ code: 0, humidity: 99 })).fog > 0.05);
  assert.equal(sceneConditions(worldWith({ code: 0, humidity: 50 })).fog, 0);
});

test('snow_depth из API важнее эвристики', () => {
  const withDepth = sceneConditions(worldWith({ code: 0, tempC: -5, snowDepthM: 0.2 }));
  const withoutSnow = sceneConditions(worldWith({ code: 0, tempC: -5, snowDepthM: 0 }));

  assert.ok(withDepth.snowCover > 0.6, `покров ${withDepth.snowCover}`);
  assert.equal(withoutSnow.snowCover, 0, 'при явном нуле снега нет, даже в мороз');
});

test('свежий снег виден независимо от высоты покрова', () => {
  const conditions = sceneConditions(
    worldWith({ code: 75, tempC: -8, snowDepthM: 0.01 }),
  );
  assert.ok(conditions.snowCover >= 0.4);
});

test('на жаре остатки снега тают', () => {
  const warm = sceneConditions(worldWith({ code: 0, tempC: 16, snowDepthM: 0.3 }));
  assert.equal(warm.snowCover, 0);
});

test('иней: мороз и влажный воздух, независимо от осадков', () => {
  assert.ok(rimeLoad(-8, 95) > 0.8, `иней ${rimeLoad(-8, 95)}`);
  assert.ok(rimeLoad(-8, 95) > rimeLoad(-4, 95), 'в крепкий мороз инея больше');
  assert.ok(rimeLoad(-8, 95) > rimeLoad(-8, 70), 'в сухой воздух иней не садится');
  assert.equal(rimeLoad(-1, 99), 0, 'при нуле инея нет');
  assert.equal(rimeLoad(5, 99), 0);
});

test('в снегопад иней есть, но слабее — его маскируют шапки', () => {
  assert.ok(rimeLoad(-8, 95, true) < rimeLoad(-8, 95, false));
  assert.ok(rimeLoad(-8, 95, true) > 0);
});

test('иней попадает в условия сцены', () => {
  assert.ok(sceneConditions(worldWith({ code: 0, tempC: -8, humidity: 95 })).rime > 0.7);
  assert.equal(sceneConditions(worldWith({ code: 0, tempC: 10, humidity: 95 })).rime, 0);
});

test('влага после дождя сохнет ~15 минут', () => {
  assert.equal(dryingWetness(0.8, 0, 0.8), 0.8);
  assert.ok(dryingWetness(0, 3, 0.8) > 0.4, 'через 3 минуты ещё мокро');
  assert.ok(dryingWetness(0, 10, 0.8) < dryingWetness(0, 3, 0.8));
  assert.equal(dryingWetness(0, 15, 0.8), 0);
  assert.equal(dryingWetness(0, 60, 0.8), 0);
  assert.equal(dryingWetness(0, 0, 0), 0, 'без дождя сухо даже сразу');
});

test('мокрость в сцене держится после дождя', () => {
  const drying = sceneConditions(worldWith({ code: 3, tempC: 12, sinceRainMin: 5, lastRainIntensity: 0.6 }));
  const dry = sceneConditions(worldWith({ code: 3, tempC: 12 }));

  assert.ok(drying.wetness > 0.3, `мокрость ${drying.wetness}`);
  assert.equal(dry.wetness, 0);
});
