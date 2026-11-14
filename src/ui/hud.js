// HUD: часы, дата, погода, источник данных. Только DOM — никакого canvas.

import { formatClockParts, formatDate, formatRelative } from '../model/clock.js';
import { describeWeather, formatTemp, formatWind } from '../model/weather.js';
import { dict, normalizeLang } from '../model/i18n.js';

/**
 * @param {Document} [doc]
 * @param {{lang?: string}} [options]
 */
export function createHud(doc = document, { lang: initialLang = 'ru' } = {}) {
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
    windLabel: byId('label-wind'),
    humidityLabel: byId('label-humidity'),
    cloudLabel: byId('label-cloud'),
    source: byId('source'),
    place: byId('place-btn'),
    refresh: byId('refresh-btn'),
    langBtn: byId('lang-btn'),
    message: byId('hud-message'),
    sun: byId('sun-times'),
  };

  let lang = normalizeLang(initialLang);
  let offsetSeconds = -new Date().getTimezoneOffset() * 60;
  let sourceKind = 'loading';
  let fetchedAt = null;
  let lastDate = '';
  let lastStation = null;
  let lastSun = null;

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function renderStatic() {
    const strings = dict(lang);
    setText(el.windLabel, strings.hud.windLabel);
    setText(el.humidityLabel, strings.hud.humidityLabel);
    setText(el.cloudLabel, strings.hud.cloudLabel);
    if (el.refresh) {
      el.refresh.setAttribute('aria-label', strings.hud.refreshAria);
      el.refresh.title = strings.hud.refreshTitle;
    }
    if (el.place) el.place.title = el.place.textContent || strings.hud.placeTitle;
    if (el.langBtn) {
      setText(el.langBtn, lang.toUpperCase());
      el.langBtn.title = strings.hud.langTitle;
    }
    if (!lastStation && el.place && el.place.dataset.placeholder !== '0') {
      setText(el.place, strings.hud.detectingPlace);
    }
  }

  function renderSource() {
    if (!el.source) return;
    const strings = dict(lang);
    const label = strings.sources[sourceKind] ?? sourceKind;
    const relative = fetchedAt ? ` · ${formatRelative(fetchedAt, Date.now(), lang)}` : '';
    el.source.dataset.state = sourceKind;
    setText(el.source, `${label}${relative}`);
  }

  /** Тик часов: вызывается из rAF, меняет DOM только при реальном изменении. */
  function tick(atMs = Date.now()) {
    const date = new Date(atMs + offsetSeconds * 1000);
    const { hh, mm, ss } = formatClockParts(date);
    setText(el.time, `${hh}:${mm}`);
    setText(el.seconds, ss);

    const dateText = formatDate(date, lang);
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

    lastStation = station;
    if (Number.isFinite(station.utcOffsetSeconds)) offsetSeconds = station.utcOffsetSeconds;
    sourceKind = source;
    fetchedAt = at === null
      ? null
      : Number.isFinite(at)
        ? at
        : Number.isFinite(station.fetchedAt)
          ? station.fetchedAt
          : null;

    setText(el.temp, formatTemp(current.tempC));
    setText(el.condition, describeWeather(current.code, current.tempC, lang));
    setText(el.feels, dict(lang).hud.feelsLike(formatTemp(current.feelsC)));
    setText(el.wind, formatWind(current.windKmh, current.windDirDeg, lang));
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
    el.place.dataset.placeholder = '0';
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

  /**
   * Восход и закат. Для полярных широт — словесная метка вместо пустых часов.
   * @param {{sunrise: string|null, sunset: string|null, polar: string|null}|null} sun
   */
  function setSun(sun) {
    lastSun = sun;
    if (!el.sun) return;

    if (!sun) {
      setText(el.sun, '');
      return;
    }

    const strings = dict(lang).hud;
    if (sun.polar === 'day') {
      setText(el.sun, strings.polarDay);
      return;
    }
    if (sun.polar === 'night') {
      setText(el.sun, strings.polarNight);
      return;
    }

    const clock = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : null);
    const sunrise = clock(sun.sunrise);
    const sunset = clock(sun.sunset);

    setText(el.sun, sunrise && sunset ? strings.sunTimes(sunrise, sunset) : '');
  }

  /** Короткая подсказка под плашкой источника (какой провайдер ответил). */
  function setSourceHint(text) {
    if (el.source) el.source.title = text ?? '';
  }

  /** @param {string} nextLang */
  function setLang(nextLang) {
    lang = normalizeLang(nextLang);
    lastDate = '';
    renderStatic();
    renderSource();
    if (lastStation) setStation(lastStation, { source: sourceKind, fetchedAt });
    else tick();
    if (lastSun) setSun(lastSun);
  }

  renderStatic();

  return { tick, setStation, setSource, setPlace, setMessage, setSourceHint, setSun, setLang, element: el };
}
