// Единая точка констант. Ничего не импортирует — можно тянуть откуда угодно.

/** Логическое разрешение сцены. Апскейл — только целым множителем. */
export const LOGICAL = { width: 320, height: 180 };

/** Линия горизонта: выше — небо, ниже — земля. */
export const HORIZON_Y = 118;

/** Цвет фона до появления сцены (M2). */
export const PLACEHOLDER_BG = '#0b1026';

export const WEATHER = {
  forecastUrl: 'https://api.open-meteo.com/v1/forecast',
  /** Как часто обновляем погоду, пока вкладка видима. */
  refreshMs: 10 * 60_000,
  /** После этого данные считаются устаревшими при возврате на вкладку. */
  staleAfterMs: 12 * 60_000,
  /** Кэш живёт сутки: даже суточной давности кадр лучше пустого экрана. */
  cacheTtlMs: 24 * 60 * 60_000,
  timeoutMs: 6_000,
  retries: 0,
  /** Сколько раз пробуем перезапросить, если данных нет вообще. */
  retryAfterFailureMs: 45_000,
  retryBudget: 5,
};

/**
 * Второй провайдер. Нужен, потому что api.open-meteo.com недоступен из некоторых
 * сетей (например, из РФ). wttr.in — тоже без ключа и с открытым CORS.
 */
export const WTTR = {
  baseUrl: 'https://wttr.in',
  timeoutMs: 8_000,
  retries: 0,
};

export const GEOCODE = {
  searchUrl: 'https://geocoding-api.open-meteo.com/v1/search',
  reverseUrl: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
  ipUrl: 'https://ipwho.is/',
  language: 'ru',
  results: 8,
  timeoutMs: 6_000,
};

export const STORAGE_KEYS = {
  place: 'weather-tree:place:v1',
  station: 'weather-tree:station:v1',
  provider: 'weather-tree:provider:v1',
};

/** Если всё остальное не сработало — показываем Москву. */
export const FALLBACK_PLACE = {
  name: 'Москва',
  country: 'Россия',
  lat: 55.7558,
  lon: 37.6173,
  timeZone: 'Europe/Moscow',
};

/** Локали форматирования. */
export const LOCALE = 'ru-RU';
