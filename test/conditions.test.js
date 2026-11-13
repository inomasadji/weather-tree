import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPrecipitation,
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
