// Время в часовом поясе точки наблюдения и его форматирование.
// Всё считается от «сдвинутой» даты: Date.now() + смещение, дальше — UTC-геттеры.
// Так часы станции идут правильно независимо от пояса устройства.

import { LOCALE } from '../config.js';

const pad = (value) => String(value).padStart(2, '0');

/**
 * Локальное «настенное» время точки в виде Date (читать через getUTC*).
 * @param {number} offsetSeconds смещение от UTC в секундах (utc_offset_seconds)
 * @param {number} [atMs]
 * @returns {Date}
 */
export function stationDate(offsetSeconds = 0, atMs = Date.now()) {
  return new Date(atMs + offsetSeconds * 1000);
}

/**
 * @param {Date} date
 * @returns {{hh: string, mm: string, ss: string}}
 */
export function formatClockParts(date) {
  return {
    hh: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
  };
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * «сб, 14 января» — от сдвинутой даты, поэтому timeZone: 'UTC'.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return dateFormatter.format(date);
}

/**
 * Номер дня в году, 1…366.
 * @param {Date} date
 * @returns {number}
 */
export function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((current - start) / 86_400_000);
}

/**
 * Смещение пояса по IANA-имени на конкретный момент (учитывает летнее время).
 * Нужно провайдерам, которые не отдают utc_offset_seconds (wttr.in).
 * @param {string|null|undefined} timeZone
 * @param {number} [atMs]
 * @returns {number} секунды от UTC
 */
export function offsetSecondsFor(timeZone, atMs = Date.now()) {
  const deviceOffset = -new Date(atMs).getTimezoneOffset() * 60;
  if (!timeZone) return deviceOffset;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(atMs));

    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(name);
    if (!match) return 0; // «GMT» без смещения

    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60);
  } catch {
    return deviceOffset;
  }
}

/**
 * «сейчас», «3 мин назад», «2 ч назад».
 * @param {number} fromMs
 * @param {number} [atMs]
 * @returns {string}
 */
export function formatRelative(fromMs, atMs = Date.now()) {
  const minutes = Math.max(0, Math.round((atMs - fromMs) / 60_000));
  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} сут назад`;
}
