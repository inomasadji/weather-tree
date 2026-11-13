// HUD: часы, дата, погода, источник данных. Только DOM — никакого canvas.

import { formatClockParts, formatDate, formatRelative } from '../model/clock.js';
import { describeWeather, formatTemp, formatWind } from '../model/weather.js';

const SOURCE_LABELS = {
  live: 'live',
  cache: 'кэш',
  error: 'нет данных',
  loading: 'загрузка',
  demo: 'демо',
};

/**
 * @param {Document} [doc]
 */
export function createHud(doc = document) {
  const byId = (id) => doc.getElementById(id);
  const el = {
    time: byId('clock-time'),
    seconds: byId('clock-seconds'),
    date: byId('clock-date'),
    temp: byId('temp'),
    condition: byId('condition'),
    feels: byId('feels'),
    wind: byId('wind'),
    humidity: byId('humidity'),
    cloud: byId('cloud'),
    source: byId('source'),
    place: byId('place-btn'),
    message: byId('hud-message'),
  };

  let offsetSeconds = -new Date().getTimezoneOffset() * 60;
  let sourceKind = 'loading';
  let fetchedAt = null;
  let lastDate = '';

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function renderSource() {
    if (!el.source) return;
    const label = SOURCE_LABELS[sourceKind] ?? sourceKind;
    const relative = fetchedAt ? ` · ${formatRelative(fetchedAt)}` : '';
    el.source.dataset.state = sourceKind;
    setText(el.source, `${label}${relative}`);
  }

  /** Тик часов: вызывается из rAF, меняет DOM только при реальном изменении. */
  function tick(atMs = Date.now()) {
    const date = new Date(atMs + offsetSeconds * 1000);
    const { hh, mm, ss } = formatClockParts(date);
    setText(el.time, `${hh}:${mm}`);
    setText(el.seconds, ss);

    const dateText = formatDate(date);
    if (dateText !== lastDate) {
      setText(el.date, dateText);
      lastDate = dateText;
    }

    if (sourceKind === 'live' || sourceKind === 'cache') renderSource();
  }

  /**
   * @param {object} station
   * @param {{source?: string, fetchedAt?: number}} [meta]
   */
  function setStation(station, { source = 'live', fetchedAt: at } = {}) {
    const current = station.current;
    if (!current) return;

    if (Number.isFinite(station.utcOffsetSeconds)) offsetSeconds = station.utcOffsetSeconds;
    sourceKind = source;
    fetchedAt = Number.isFinite(at) ? at : Number.isFinite(station.fetchedAt) ? station.fetchedAt : null;

    setText(el.temp, formatTemp(current.tempC));
    setText(el.condition, describeWeather(current.code, current.tempC));
    setText(el.feels, `ощущается как ${formatTemp(current.feelsC)}`);
    setText(el.wind, formatWind(current.windKmh, current.windDirDeg));
    setText(el.humidity, `${Math.round(current.humidity)}%`);
    setText(el.cloud, `${Math.round(current.cloudPct)}%`);

    renderSource();
    tick();
  }

  /** @param {string} kind */
  function setSource(kind, at = null) {
    sourceKind = kind;
    fetchedAt = at ?? (kind === 'live' || kind === 'cache' ? fetchedAt : null);
    renderSource();
  }

  /** @param {{name: string, country?: string}} place */
  function setPlace(place) {
    if (!place || !el.place) return;
    const label = place.country && place.country !== place.name
      ? `${place.name}, ${place.country}`
      : place.name;
    setText(el.place, label);
    el.place.title = label;
  }

  /** @param {string|null} text */
  function setMessage(text) {
    if (!el.message) return;
    el.message.textContent = text ?? '';
    el.message.hidden = !text;
  }

  return { tick, setStation, setSource, setPlace, setMessage, element: el };
}
