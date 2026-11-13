/**
 * Lists in text: a line that starts with a bullet ("• ", "- ", "* ") or a number ("1. ", "2) ")
 * continues the list when Enter is pressed. Pure helpers for the text editor.
 */

const BULLET = /^(\s*)([•\-*–])\s+/
const NUMBER = /^(\s*)(\d{1,3})([.)])\s+/

/** The bullet every list item gets ("- " and "* " typed at a line start become this). */
export const BULLET_MARK = '• '

/** The list marker at the start of a line (with its indent and the space after it), or null. */
export function listMarker(line: string): string | null {
  return BULLET.exec(line)?.[0] ?? NUMBER.exec(line)?.[0] ?? null
}

/**
 * What Enter does at the end of `line`: `next` is the marker the new line starts with (the next
 * number for numbered lists), `exit` means the line holds nothing but a marker, so Enter ends the
 * list by removing it. Null when the line isn't a list item.
 */
export function continueList(line: string): { next: string; exit: boolean } | null {
  const marker = listMarker(line)
  if (marker === null) return null
  const exit = line.slice(marker.length).trim() === ''
  const num = NUMBER.exec(line)
  if (num) return { next: `${num[1]}${Number(num[2]) + 1}${num[3]} `, exit }
  const bullet = BULLET.exec(line)!
  return { next: `${bullet[1]}${BULLET_MARK}`, exit }
}

/** "- " or "* " typed at the start of a line: the typographic bullet that replaces it, else null. */
export function autoBullet(lineBeforeCaret: string): string | null {
  return /^\s*[-*] $/.test(lineBeforeCaret) ? lineBeforeCaret.replace(/[-*] $/, BULLET_MARK) : null
}
