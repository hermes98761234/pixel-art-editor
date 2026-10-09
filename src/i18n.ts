import { UK as APP_UK } from './uk'

export type Lang = 'en' | 'uk'
export type T = (s: string, ...args: (string | number)[]) => string

export const COMMON_UK: Record<string, string> = {
  'Source on GitHub': 'Код на GitHub',
  Language: 'Мова',
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  'Runs entirely in your browser. Nothing is uploaded.': 'Працює повністю у браузері. Нічого не завантажується.',
  Download: 'Завантажити',
  Export: 'Експорт',
  Import: 'Імпорт',
  Copy: 'Копіювати',
  Copied: 'Скопійовано',
  Reset: 'Скинути',
  Remove: 'Видалити',
  Add: 'Додати',
  Clear: 'Очистити',
  Cancel: 'Скасувати',
  Settings: 'Налаштування',
  Undo: 'Скасувати дію',
  Redo: 'Повторити',
  Delete: 'Видалити',
  Name: 'Назва',
  Width: 'Ширина',
  Height: 'Висота',
  Size: 'Розмір',
  Color: 'Колір',
  Text: 'Текст',
  Play: 'Відтворити',
  Pause: 'Пауза',
  Stop: 'Стоп',
}

const DICT: Record<string, string> = { ...COMMON_UK, ...APP_UK }

/** English source string → Ukrainian. `{0}`, `{1}` are placeholders for interpolated values. */
export function tr(lang: Lang, s: string, ...args: (string | number)[]): string {
  const src = lang === 'uk' ? (DICT[s] ?? s) : s
  return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
}
