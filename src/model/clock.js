// Время в часовом поясе точки наблюдения и его форматирование.
// Всё считается от «сдвинутой» даты: Date.now() + смещение, дальше — UTC-геттеры.
// Так часы станции идут правильно независимо от пояса устройства.

import { dict } from './i18n.js';

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
 * Момент времени → местная ISO-строка без зоны: «2026-01-14T19:15».
 * Нужно, чтобы восход/закат из расчёта выглядели так же, как из API.
 * @param {number|null} atMs
 * @param {number} offsetSeconds
 * @returns {string|null}
 */
export function toLocalIso(atMs, offsetSeconds = 0) {
  if (atMs === null || !Number.isFinite(atMs)) return null;
  return new Date(atMs + offsetSeconds * 1000).toISOString().slice(0, 16);
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

const dateFormatters = new Map();

function getDateFormatter(locale) {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * «сб, 14 января» — от сдвинутой даты, поэтому timeZone: 'UTC'.
 * @param {Date} date
 * @param {string} [lang]
 * @returns {string}
 */
export function formatDate(date, lang = 'ru') {
  return getDateFormatter(dict(lang).locale).format(date);
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
 * @param {string} [lang]
 * @returns {string}
 */
export function formatRelative(fromMs, atMs = Date.now(), lang = 'ru') {
  const { relative } = dict(lang);
  const minutes = Math.max(0, Math.round((atMs - fromMs) / 60_000));
  if (minutes < 1) return relative.now;
  if (minutes < 60) return relative.min(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.hour(hours);
  return relative.day(Math.round(hours / 24));
}
