import test from 'node:test';
import assert from 'node:assert/strict';

import { forestDensity, speciesFor, treeSeed } from '../src/model/species.js';
import { foliageState } from '../src/model/phenology.js';

test('speciesFor детерминирован и соответствует широтным поясам', () => {
  const moscowSeed = treeSeed(55.7558, 37.6173);
  assert.equal(speciesFor(55.7558, moscowSeed), speciesFor(55.7558, moscowSeed));
  assert.equal(speciesFor(55.7558, moscowSeed), 'oak');

  const murmanskSeed = treeSeed(68.9585, 33.0827);
  assert.equal(speciesFor(68.9585, murmanskSeed), 'conifer');

  const singaporeSeed = treeSeed(1.35, 103.82);
  assert.equal(speciesFor(1.35, singaporeSeed), 'tropical');

  for (let seed = 0; seed < 50; seed += 1) {
    assert.notEqual(speciesFor(70, seed), 'tropical');
    assert.equal(speciesFor(10, seed), 'tropical');
  }
});

test('forestDensity выше в лесных умеренных широтах, чем в Заполярье', () => {
  const temperate = forestDensity(54, 123);
  const arctic = forestDensity(76, 123);
  assert.ok(temperate > arctic, `temperate=${temperate}, arctic=${arctic}`);
  assert.ok(temperate <= 0.95 && arctic >= 0.05);
});

test('хвойные и тропические породы вечнозелёные зимой', () => {
  const coniferWinter = foliageState(0, { tempC: -18, species: 'conifer' });
  const tropicalWinter = foliageState(0, { tempC: 24, species: 'tropical' });

  assert.ok(coniferWinter.coverage > 0.8);
  assert.equal(coniferWinter.litter, 0);
  assert.equal(coniferWinter.stage, 'evergreen');
  assert.ok(tropicalWinter.coverage > 0.8);
  assert.equal(tropicalWinter.stage, 'evergreen');
});
