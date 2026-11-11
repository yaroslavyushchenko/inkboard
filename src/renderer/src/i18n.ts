import { useUI } from './store'

const en = {
  'tool.pen': 'Pen {n} ({n})',
  'tool.highlighter': 'Highlighter (H)',
  'tool.eraser': 'Eraser (E)',
  'tool.pan': 'Pan (or hold Space)',
  'tool.image': 'Insert image (or Ctrl+V / drop a file)',
  'action.undo': 'Undo (Ctrl+Z)',
  'action.redo': 'Redo (Ctrl+Y)',
  'zoom.out': 'Zoom out (Ctrl −)',
  'zoom.in': 'Zoom in (Ctrl +)',
  'zoom.reset': 'Zoom to 100% (Ctrl+0)',
  'settings.title': 'Board settings',
  'settings.background': 'Background',
  'settings.language': 'Language',
  'bg.blank': 'Blank',
  'bg.dots': 'Dots',
  'bg.grid': 'Grid',
  'bg.lines': 'Lines',
  'tool.select': 'Lasso select (V)',
  'sel.delete': 'Delete (Del)',
  'sel.duplicate': 'Duplicate (Ctrl+D)',
  'menu.title': 'Menu',
  'file.new': 'New board',
  'file.open': 'Open…',
  'file.save': 'Save',
  'file.saveAs': 'Save as…',
  'file.untitled': 'Untitled board',
  'file.unsavedPrompt': 'This board has unsaved changes. Save them first?',
  'file.dontSave': "Don't save",
  'file.cancel': 'Cancel',
  'file.openError': 'Could not open this file.',
  'file.unsaved': 'Unsaved changes'
}

export type MessageKey = keyof typeof en

const uk: Record<MessageKey, string> = {
  'tool.pen': 'Перо {n} ({n})',
  'tool.highlighter': 'Маркер (H)',
  'tool.eraser': 'Гумка (E)',
  'tool.pan': 'Переміщення (або затисніть пробіл)',
  'tool.image': 'Вставити зображення (або Ctrl+V / перетягніть файл)',
  'action.undo': 'Скасувати (Ctrl+Z)',
  'action.redo': 'Повторити (Ctrl+Y)',
  'zoom.out': 'Віддалити (Ctrl −)',
  'zoom.in': 'Наблизити (Ctrl +)',
  'zoom.reset': 'Масштаб 100% (Ctrl+0)',
  'settings.title': 'Налаштування дошки',
  'settings.background': 'Фон',
  'settings.language': 'Мова',
  'bg.blank': 'Порожньо',
  'bg.dots': 'Крапки',
  'bg.grid': 'Клітинка',
  'bg.lines': 'Лінійка',
  'tool.select': 'Виділення ласо (V)',
  'sel.delete': 'Видалити (Del)',
  'sel.duplicate': 'Дублювати (Ctrl+D)',
  'menu.title': 'Меню',
  'file.new': 'Нова дошка',
  'file.open': 'Відкрити…',
  'file.save': 'Зберегти',
  'file.saveAs': 'Зберегти як…',
  'file.untitled': 'Дошка без назви',
  'file.unsavedPrompt': 'На дошці є незбережені зміни. Зберегти їх?',
  'file.dontSave': 'Не зберігати',
  'file.cancel': 'Скасувати',
  'file.openError': 'Не вдалося відкрити цей файл.',
  'file.unsaved': 'Незбережені зміни'
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
