// Статические проверки архитектуры, бюджета размера и целостности ссылок (0 зависимостей).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { Surface } from '../src/render/surface.js';
import { renderScene } from '../src/render/scene.js';
import { LOGICAL } from '../src/config.js';
import { SCENARIOS, scenarioWorld } from '../tools/snapshot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_APP_BYTES = 250 * 1024;
const MAX_FILE_LINES = 310;

/** @param {string} dir @returns {Array<string>} */
function listJsFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}

test('package.json не содержит ни runtime, ни dev-зависимостей', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(Object.keys(pkg.devDependencies ?? {}).length, 0);
});

test('бюджет размера статики ≤ 250 КБ и длина файлов в src/ ≤ 310 строк', () => {
  const shellFiles = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icon.svg']
    .map((file) => join(ROOT, file));
  const srcFiles = listJsFiles(join(ROOT, 'src'));

  let totalBytes = 0;
  for (const file of [...shellFiles, ...srcFiles]) {
    totalBytes += statSync(file).size;
  }
  assert.ok(totalBytes <= MAX_APP_BYTES, `размер статики: ${totalBytes} Б > ${MAX_APP_BYTES}`);

  for (const file of srcFiles) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).length;
    assert.ok(lines <= MAX_FILE_LINES, `${file}: ${lines} строк > ${MAX_FILE_LINES}`);
  }
});

test('все импорты в src/ используют .js-расширение и ведут на существующие файлы', () => {
  const srcFiles = listJsFiles(join(ROOT, 'src'));
  const importRe = /^\s*import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm;

  for (const file of srcFiles) {
    const code = readFileSync(file, 'utf8');
    let match;
    while ((match = importRe.exec(code)) !== null) {
      const specifier = match[1];
      assert.ok(specifier.endsWith('.js'), `${file}: импорт без .js — "${specifier}"`);
      const target = resolve(dirname(file), specifier);
      assert.ok(existsSync(target), `${file}: битый импорт "${specifier}"`);
    }
  }
});

const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('детерминизм: в src/render/ нет Math.random()', () => {
  for (const file of listJsFiles(join(ROOT, 'src', 'render'))) {
    const code = stripComments(readFileSync(file, 'utf8'));
    assert.equal(code.includes('Math.random('), false, `найден Math.random() в ${file}`);
  }
});

test('чистые слои model/ и render/surface.js не трогают DOM и localStorage', () => {
  const files = [
    ...listJsFiles(join(ROOT, 'src', 'model')),
    join(ROOT, 'src', 'render', 'surface.js'),
  ];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    assert.equal(/\b(document|window|localStorage)\b/.test(code), false, `DOM/storage в ${file}`);
  }
});

test('index.html, manifest.webmanifest и sw.js не содержат битых локальных ссылок и дублей id', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.match(html, /<html\s+lang="ru">/);
  assert.match(html, /<meta\s+name="viewport"/);
  assert.match(html, /<title>.+<\/title>/);

  const ids = new Set();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    assert.equal(ids.has(match[1]), false, `дубликат id="${match[1]}" в index.html`);
    ids.add(match[1]);
  }

  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const ref = match[1];
    if (ref.startsWith('data:') || ref.startsWith('http://') || ref.startsWith('https://')) continue;
    assert.ok(existsSync(join(ROOT, ref)), `битая ссылка в index.html: ${ref}`);
  }

  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons ?? []) {
    const clean = icon.src.replace(/^\.\//, '');
    assert.ok(existsSync(join(ROOT, clean)), `битая иконка в manifest: ${icon.src}`);
  }

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shellMatch = sw.match(/const SHELL = \[([^\]]+)\]/);
  assert.ok(shellMatch, 'в sw.js не найден массив SHELL');
  for (const item of shellMatch[1].matchAll(/'([^']+)'/g)) {
    const path = item[1].replace(/^\.\//, '') || 'index.html';
    assert.ok(existsSync(join(ROOT, path)), `битый путь в sw.js SHELL: ${item[1]}`);
  }
});

test('бюджет производительности: медиана кадра 320×180 < 4 мс', () => {
  const { world, atMs } = scenarioWorld(SCENARIOS[2]);
  const surface = new Surface(LOGICAL.width, LOGICAL.height);
  const times = [];

  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    renderScene(surface, world, atMs, atMs + index * 16);
    times.push(performance.now() - started);
  }

  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  assert.ok(median < 4, `медиана кадра: ${median.toFixed(2)} мс ≥ 4 мс`);
});
