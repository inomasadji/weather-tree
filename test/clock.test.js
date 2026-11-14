import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dayOfYear,
  formatClockParts,
  formatDate,
  formatRelative,
  offsetSecondsFor,
  stationDate,
  toLocalIso,
} from '../src/model/clock.js';

test('stationDate сдвигает момент на смещение пояса', () => {
  const date = stationDate(3 * 3600, Date.UTC(2026, 0, 14, 16, 15));
  assert.equal(date.toISOString(), '2026-01-14T19:15:00.000Z');
});

test('stationDate без смещения — это UTC', () => {
  const date = stationDate(0, Date.UTC(2026, 6, 9, 12, 0));
  assert.equal(date.toISOString(), '2026-07-09T12:00:00.000Z');
});

test('formatClockParts дополняет нулями', () => {
  assert.deepEqual(formatClockParts(new Date(Date.UTC(2026, 6, 9, 9, 5, 7))), {
    hh: '09',
    mm: '05',
    ss: '07',
  });
});

test('formatDate — русская дата в родительном падеже', () => {
  const text = formatDate(new Date(Date.UTC(2026, 0, 14)));
  assert.match(text, /^ср/);
  assert.match(text, /14 января/);
});

test('dayOfYear считает с единицы', () => {
  assert.equal(dayOfYear(new Date(Date.UTC(2026, 0, 1))), 1);
  assert.equal(dayOfYear(new Date(Date.UTC(2026, 11, 31))), 365);
  assert.equal(dayOfYear(new Date(Date.UTC(2024, 11, 31))), 366);
});

test('formatRelative переводит минуты в человеческий вид', () => {
  const now = 1_000_000_000;
  assert.equal(formatRelative(now, now), 'сейчас');
  assert.equal(formatRelative(now - 5 * 60_000, now), '5 мин назад');
  assert.equal(formatRelative(now - 3 * 3_600_000, now), '3 ч назад');
  assert.equal(formatRelative(now - 2 * 86_400_000, now), '2 сут назад');
});

test('offsetSecondsFor считает смещение по IANA-имени', () => {
  const winter = Date.UTC(2026, 0, 14, 12, 0);
  assert.equal(offsetSecondsFor('Europe/Moscow', winter), 3 * 3600);
  assert.equal(offsetSecondsFor('Asia/Yekaterinburg', winter), 5 * 3600);
  assert.equal(offsetSecondsFor('UTC', winter), 0);

  // Летнее время: Берлин зимой +1, летом +2.
  assert.equal(offsetSecondsFor('Europe/Berlin', winter), 1 * 3600);
  assert.equal(offsetSecondsFor('Europe/Berlin', Date.UTC(2026, 6, 9, 12, 0)), 2 * 3600);
});

test('offsetSecondsFor без пояса отдаёт пояс устройства', () => {
  const offset = offsetSecondsFor(null, Date.UTC(2026, 0, 14, 12, 0));
  assert.equal(typeof offset, 'number');
  assert.equal(offset, -new Date(Date.UTC(2026, 0, 14, 12, 0)).getTimezoneOffset() * 60);
});

test('toLocalIso: момент → местная ISO-строка', () => {
  assert.equal(toLocalIso(Date.UTC(2026, 0, 14, 5, 56), 3 * 3600), '2026-01-14T08:56');
  assert.equal(toLocalIso(Date.UTC(2026, 0, 14, 13, 34), 3 * 3600), '2026-01-14T16:34');
  assert.equal(toLocalIso(null, 0), null);
});
