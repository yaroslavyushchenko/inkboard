import { useUI } from './store'

const en = {
  'tool.pen': 'Pen {n} ({n})',
  'tool.highlighter': 'Highlighter (H)',
  'tool.eraser': 'Eraser (E)',
  'tool.pan': 'Pan (or hold Space)',
  'tool.image': 'Insert image (or Ctrl+V / drop a file)',
  'tool.select': 'Lasso select (V)',
  'action.undo': 'Undo (Ctrl+Z)',
  'action.redo': 'Redo (Ctrl+Y)',
  'zoom.out': 'Zoom out (Ctrl −)',
  'zoom.in': 'Zoom in (Ctrl +)',
  'zoom.reset': 'Zoom to 100% (Ctrl+0)',
  'sel.delete': 'Delete (Del)',
  'sel.duplicate': 'Duplicate (Ctrl+D)',

  'settings.title': 'Settings',
  'settings.background': 'Background',
  'settings.language': 'Language',
  'settings.backup': 'Backup folder',
  'settings.backupHint': 'Every board is also copied here automatically — e.g. a USB stick or a Google Drive / OneDrive folder.',
  'settings.backupOff': 'Off',
  'settings.backupChoose': 'Choose folder…',
  'settings.backupChange': 'Change…',
  'settings.backupDisable': 'Turn off',
  'bg.blank': 'Blank',
  'bg.dots': 'Dots',
  'bg.grid': 'Grid',
  'bg.lines': 'Lines',

  'board.defaultName': 'Board',
  'menu.title': 'Menu',
  'menu.home': 'All boards',
  'menu.newBoard': 'New board',
  'menu.openFile': 'Open file…',
  'menu.saveAsFile': 'Save as file…',
  'menu.showInFolder': 'Show in folder',
  'menu.history': 'Version history',
  'menu.exportPng': 'Export as PNG…',
  'menu.exportPdf': 'Export as PDF…',
  'menu.exportSelPng': 'Export selection as PNG…',
  'menu.exportSelPdf': 'Export selection as PDF…',
  'menu.rename': 'Click to rename',

  'save.saved': 'Saved',
  'save.saving': 'Saving…',
  'save.error': "Couldn't save the file — a copy is kept in the app",
  'save.inApp': 'Saved automatically in Inkboard. Use “Save as file…” to put it in a folder.',
  'save.inFile': 'Saved automatically to {path}',

  'home.title': 'All boards',
  'home.newBoard': 'New board',
  'home.openFile': 'Open file…',
  'home.search': 'Search boards',
  'home.back': 'Back to board',
  'home.pinned': 'Pinned',
  'home.boards': 'Boards',
  'home.recentlyDeleted': 'Recently deleted',
  'home.deletedHint': 'Deleted boards are kept here for 30 days.',
  'home.empty': 'No boards yet — create your first one.',
  'home.noResults': 'No boards match.',
  'home.edited': 'Edited {when}',
  'home.deletedWhen': 'Deleted {when}',
  'home.inApp': 'In Inkboard',
  'home.missing': 'File not found',
  'home.allTags': 'All',

  'card.open': 'Open',
  'card.rename': 'Rename',
  'card.pin': 'Pin',
  'card.unpin': 'Unpin',
  'card.duplicate': 'Duplicate',
  'card.tags': 'Tags',
  'card.saveAsFile': 'Save as file…',
  'card.showInFolder': 'Show in folder',
  'card.delete': 'Delete',
  'card.removeFromList': 'Remove from list',
  'card.removeFromListHint': 'The file itself stays where it is.',
  'card.restore': 'Restore',
  'card.deleteForever': 'Delete forever',
  'card.confirmDeleteForever': 'Delete “{title}” forever? This cannot be undone.',
  'card.locate': 'Locate file…',
  'card.more': 'More actions',

  'tags.manage': 'Manage tags',
  'tags.new': 'New tag',
  'tags.placeholder': 'Tag name, e.g. 5A or Math',
  'tags.add': 'Add',
  'tags.delete': 'Delete tag',
  'tags.none': 'No tags yet.',

  'history.title': 'Version history',
  'history.hint': 'A snapshot is saved automatically every 10 minutes of editing (last 20 kept).',
  'history.empty': 'No snapshots yet.',
  'history.restore': 'Restore',
  'history.restored': 'Version restored. Press Ctrl+Z to undo.',
  'history.close': 'Close',

  'file.openError': 'Could not open this board.',
  'export.error': 'Export failed.',
  'common.cancel': 'Cancel',
  'common.close': 'Close'
}

export type MessageKey = keyof typeof en

const uk: Record<MessageKey, string> = {
  'tool.pen': 'Перо {n} ({n})',
  'tool.highlighter': 'Маркер (H)',
  'tool.eraser': 'Гумка (E)',
  'tool.pan': 'Переміщення (або затисніть пробіл)',
  'tool.image': 'Вставити зображення (або Ctrl+V / перетягніть файл)',
  'tool.select': 'Виділення ласо (V)',
  'action.undo': 'Скасувати (Ctrl+Z)',
  'action.redo': 'Повторити (Ctrl+Y)',
  'zoom.out': 'Віддалити (Ctrl −)',
  'zoom.in': 'Наблизити (Ctrl +)',
  'zoom.reset': 'Масштаб 100% (Ctrl+0)',
  'sel.delete': 'Видалити (Del)',
  'sel.duplicate': 'Дублювати (Ctrl+D)',

  'settings.title': 'Налаштування',
  'settings.background': 'Фон',
  'settings.language': 'Мова',
  'settings.backup': 'Папка резервних копій',
  'settings.backupHint': 'Кожна дошка також автоматично копіюється сюди — наприклад, на флешку або в папку Google Drive / OneDrive.',
  'settings.backupOff': 'Вимкнено',
  'settings.backupChoose': 'Вибрати папку…',
  'settings.backupChange': 'Змінити…',
  'settings.backupDisable': 'Вимкнути',
  'bg.blank': 'Порожньо',
  'bg.dots': 'Крапки',
  'bg.grid': 'Клітинка',
  'bg.lines': 'Лінійка',

  'board.defaultName': 'Дошка',
  'menu.title': 'Меню',
  'menu.home': 'Усі дошки',
  'menu.newBoard': 'Нова дошка',
  'menu.openFile': 'Відкрити файл…',
  'menu.saveAsFile': 'Зберегти як файл…',
  'menu.showInFolder': 'Показати в папці',
  'menu.history': 'Історія версій',
  'menu.exportPng': 'Експорт у PNG…',
  'menu.exportPdf': 'Експорт у PDF…',
  'menu.exportSelPng': 'Експорт виділеного в PNG…',
  'menu.exportSelPdf': 'Експорт виділеного в PDF…',
  'menu.rename': 'Натисніть, щоб перейменувати',

  'save.saved': 'Збережено',
  'save.saving': 'Збереження…',
  'save.error': 'Не вдалося зберегти файл — копія зберігається в програмі',
  'save.inApp': 'Зберігається автоматично в Inkboard. «Зберегти як файл…» — щоб покласти в папку.',
  'save.inFile': 'Зберігається автоматично у {path}',

  'home.title': 'Усі дошки',
  'home.newBoard': 'Нова дошка',
  'home.openFile': 'Відкрити файл…',
  'home.search': 'Пошук дошок',
  'home.back': 'Назад до дошки',
  'home.pinned': 'Закріплені',
  'home.boards': 'Дошки',
  'home.recentlyDeleted': 'Нещодавно видалені',
  'home.deletedHint': 'Видалені дошки зберігаються тут 30 днів.',
  'home.empty': 'Дошок ще немає — створіть першу.',
  'home.noResults': 'Нічого не знайдено.',
  'home.edited': 'Змінено {when}',
  'home.deletedWhen': 'Видалено {when}',
  'home.inApp': 'В Inkboard',
  'home.missing': 'Файл не знайдено',
  'home.allTags': 'Усі',

  'card.open': 'Відкрити',
  'card.rename': 'Перейменувати',
  'card.pin': 'Закріпити',
  'card.unpin': 'Відкріпити',
  'card.duplicate': 'Дублювати',
  'card.tags': 'Теги',
  'card.saveAsFile': 'Зберегти як файл…',
  'card.showInFolder': 'Показати в папці',
  'card.delete': 'Видалити',
  'card.removeFromList': 'Прибрати зі списку',
  'card.removeFromListHint': 'Сам файл залишиться на місці.',
  'card.restore': 'Відновити',
  'card.deleteForever': 'Видалити назавжди',
  'card.confirmDeleteForever': 'Видалити «{title}» назавжди? Це не можна скасувати.',
  'card.locate': 'Знайти файл…',
  'card.more': 'Інші дії',

  'tags.manage': 'Керувати тегами',
  'tags.new': 'Новий тег',
  'tags.placeholder': 'Назва тегу, напр. 5А або Математика',
  'tags.add': 'Додати',
  'tags.delete': 'Видалити тег',
  'tags.none': 'Тегів ще немає.',

  'history.title': 'Історія версій',
  'history.hint': 'Знімок зберігається автоматично кожні 10 хвилин редагування (останні 20).',
  'history.empty': 'Знімків ще немає.',
  'history.restore': 'Відновити',
  'history.restored': 'Версію відновлено. Ctrl+Z — скасувати.',
  'history.close': 'Закрити',

  'file.openError': 'Не вдалося відкрити цю дошку.',
  'export.error': 'Не вдалося експортувати.',
  'common.cancel': 'Скасувати',
  'common.close': 'Закрити'
}

export const LANGUAGES = { en: 'English', uk: 'Українська' } as const
export type Lang = keyof typeof LANGUAGES

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, uk }

export function detectLanguage(): Lang {
  return navigator.language.toLowerCase().startsWith('uk') ? 'uk' : 'en'
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[lang][key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const lang = useUI((s) => s.lang)
  return (key, vars) => translate(lang, key, vars)
}

/** "5 minutes ago", "yesterday", … in the UI language. */
export function relativeTime(lang: Lang, ts: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const sec = Math.round((ts - now) / 1000)
  const abs = Math.abs(sec)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day')
  return new Date(ts).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
