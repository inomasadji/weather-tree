// Режим созерцания: сцена без HUD и нижней плашки, по желанию — на весь экран.
// Клавиша H (она же «р» в русской раскладке) или клик по сцене возвращают интерфейс;
// Esc выходит из полного экрана, и интерфейс тоже возвращается — пользователь
// не должен оказаться заперт в пустом экране.

/**
 * @param {{document: Document, button: HTMLElement, stage: HTMLElement,
 *          getLabels: () => {focusEnter: string, focusExit: string},
 *          onChange?: (visible: boolean) => void}} options
 */
export function createChrome({ document, button, stage, getLabels, onChange = () => {} }) {
  let visible = true;

  function sync() {
    const labels = getLabels();
    document.body.classList.toggle('is-focus', !visible);
    button.setAttribute('aria-pressed', String(!visible));
    button.setAttribute('aria-label', visible ? labels.focusEnter : labels.focusExit);
    button.title = visible ? labels.focusEnter : labels.focusExit;
    onChange(visible);
  }

  function setVisible(next) {
    if (visible === next) return;
    visible = next;
    sync();
  }

  async function enterFullscreen() {
    if (document.fullscreenElement || typeof stage.requestFullscreen !== 'function') return;
    try {
      const result = stage.requestFullscreen();
      if (result && typeof result.catch === 'function') await result.catch(() => {});
    } catch {
      // Полный экран не обязателен: режим работает и в обычном окне.
    }
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
    try {
      await document.exitFullscreen();
    } catch {
      // Уже вышли — не страшно.
    }
  }

  function toggle() {
    if (visible) {
      setVisible(false);
      enterFullscreen();
    } else {
      setVisible(true);
      exitFullscreen();
    }
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });

  // Клик по сцене возвращает интерфейс, если он спрятан. Клики по самой панели
  // и диалогу не считаются: иначе кнопка режима сразу же его выключала бы.
  stage.addEventListener('click', (event) => {
    if (visible) return;
    const origin = event.target instanceof Element ? event.target.closest('.bar, .hud, dialog') : null;
    if (origin) return;

    setVisible(true);
    exitFullscreen();
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    // Пока открыт диалог города, горячая клавиша не должна прятать интерфейс.
    if (document.querySelector('dialog[open]')) return;

    const key = String(event.key).toLowerCase();
    // «р» — та же физическая клавиша в русской раскладке.
    if (key !== 'h' && key !== 'р') return;

    event.preventDefault();
    toggle();
  });

  // Вышли из полного экрана (Esc, системная кнопка) — вернуть интерфейс.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement || visible) return;
    setVisible(true);
  });

  sync();

  return {
    setVisible,
    toggle,
    /** Перечитать подписи после смены языка. */
    sync,
    get visible() {
      return visible;
    },
  };
}
