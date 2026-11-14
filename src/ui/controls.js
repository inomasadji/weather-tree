// Диалог выбора города: поиск через Open-Meteo Geocoding с дебаунсом.

import { searchPlaces } from '../api/geocode.js';
import { dict, normalizeLang } from '../model/i18n.js';

/**
 * @param {{dialog: HTMLDialogElement, input: HTMLInputElement, results: HTMLElement, status: HTMLElement, title?: HTMLElement, searchLabel?: HTMLElement, closeBtn?: HTMLElement}} nodes
 * @param {(place: object) => void} onSelect
 * @param {{getLang?: () => string}} [options]
 */
export function createPlaceDialog(
  { dialog, input, results, status, title, searchLabel, closeBtn },
  onSelect,
  { getLang = () => 'ru' } = {},
) {
  let items = [];
  let debounce = null;
  let sequence = 0;

  const strings = () => dict(normalizeLang(getLang())).dialog;

  function applyStrings() {
    const s = strings();
    if (title) title.textContent = s.title;
    if (searchLabel) searchLabel.textContent = s.searchLabel;
    if (closeBtn) closeBtn.setAttribute('aria-label', s.closeAria);
    input.placeholder = s.placeholder;
  }

  function setStatus(text) {
    status.textContent = text ?? '';
  }

  function clearResults() {
    items = [];
    results.replaceChildren();
  }

  function renderItems(next) {
    items = next;
    results.replaceChildren();

    for (const [index, item] of next.entries()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'result';
      button.dataset.index = String(index);

      const name = document.createElement('span');
      name.className = 'result__name';
      name.textContent = item.name;

      const meta = document.createElement('span');
      meta.className = 'result__meta';
      meta.textContent = [item.region, item.country].filter(Boolean).join(', ');

      button.append(name, meta);
      row.append(button);
      results.append(row);
    }
  }

  async function run(query) {
    const current = ++sequence;
    const s = strings();

    if (query.trim().length < 2) {
      clearResults();
      setStatus('');
      return;
    }

    setStatus(s.searching);
    const result = await searchPlaces(query, normalizeLang(getLang()));

    // Пока шёл запрос, пользователь мог набрать другое — старый ответ не нужен.
    if (current !== sequence) return;

    if (!result.ok) {
      clearResults();
      setStatus(result.reason === 'timeout' ? s.timeout : s.failed);
      return;
    }

    renderItems(result.items);
    setStatus(result.items.length ? '' : s.empty);
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => run(input.value), 350);
  });

  results.addEventListener('click', (event) => {
    const button = event.target.closest('.result');
    if (!button) return;

    const item = items[Number(button.dataset.index)];
    if (!item) return;

    onSelect(item);
    clearResults();
    setStatus('');
    input.value = '';
    dialog.close();
  });

  applyStrings();

  return {
    open() {
      applyStrings();
      input.value = '';
      clearResults();
      setStatus('');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      input.focus();
    },
    setLang: applyStrings,
  };
}
