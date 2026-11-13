import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editor } from '../editor'
import { commonFormat, formatRange, mergeRuns, sameFormat, TEXT_FONT, TEXT_LINE_HEIGHT, type FullRun } from '../engine/text'
import { inkColor, withInkSurface } from '../engine/surface'
import type { TextFormat } from '@inkboard/core/types'
import { useT } from '../i18n'
import { PEN_COLORS, useUI, type TextEdit } from '../store'
import { fitBox, screenArea } from './dock'
import { autoBullet, continueList } from '../engine/lists'

/*
 * The box shown while typing on the board: a contenteditable (plain-text editing, so the browser
 * never adds its own markup) whose spans mirror the text's runs. It sits exactly where the text is
 * drawn, with the same font, sizes and line height, so what you type is what you get.
 *
 * Selecting characters (or right-clicking) shows a small format bar: colour, size, bold, italic,
 * underline for just those characters.
 */

type Base = Pick<TextEdit, 'color' | 'size'>

/** Characters a DOM node stands for (the end-of-text <br> marker counts as nothing). */
function nodeLength(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n as Text).data.length
  if (n.nodeName === 'BR') return (n as HTMLElement).dataset.end ? 0 : 1
  let len = 0
  n.childNodes.forEach((c) => (len += nodeLength(c)))
  return len
}

function readFormat(el: HTMLElement, fallback: FullRun): FullRun {
  const d = el.dataset
  if (!d.size) return fallback
  return { text: '', color: d.color ?? fallback.color, size: Number(d.size) || fallback.size, bold: d.b === '1', italic: d.i === '1', underline: d.u === '1' }
}

/** The runs currently in the editor's DOM. */
function parse(root: HTMLElement, base: Base): FullRun[] {
  const out: FullRun[] = []
  const walk = (node: Node, fmt: FullRun): void => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) out.push({ ...fmt, text: (c as Text).data })
      else if (c.nodeName === 'BR') {
        if (!(c as HTMLElement).dataset.end) out.push({ ...fmt, text: '\n' })
      } else if (c instanceof HTMLElement) {
        // A block the browser may wrap a line in starts a new line.
        if ((c.nodeName === 'DIV' || c.nodeName === 'P') && out.length && !out[out.length - 1].text.endsWith('\n')) out.push({ ...fmt, text: '\n' })
        walk(c, readFormat(c, fmt))
      }
    })
  }
  walk(root, { text: '', color: base.color, size: base.size, bold: false, italic: false, underline: false })
  return mergeRuns(out)
}

const sameRuns = (a: FullRun[], b: FullRun[]): boolean => a.length === b.length && a.every((r, i) => r.text === b[i].text && sameFormat(r, b[i]))

const minSize = (te: TextEdit): number => (te.runs.length ? Math.min(...te.runs.map((r) => r.size)) : te.size)

const shownColor = (c: string): string => withInkSurface(useUI.getState().background, () => inkColor(c))

/** Rebuilds the DOM from runs: one span per run, plus a <br> marker so a trailing new line shows. */
function render(root: HTMLElement, runs: FullRun[], zoom: number): void {
  root.textContent = ''
  for (const r of runs) {
    const s = document.createElement('span')
    s.dataset.color = r.color
    s.dataset.size = String(r.size)
    if (r.bold) s.dataset.b = '1'
    if (r.italic) s.dataset.i = '1'
    if (r.underline) s.dataset.u = '1'
    // Shown the way the board draws it (black text is chalk white on the chalkboard); data-color keeps the real colour.
    s.style.color = shownColor(r.color)
    s.style.fontSize = `${r.size * zoom}px`
    s.style.fontWeight = r.bold ? 'bold' : 'normal'
    s.style.fontStyle = r.italic ? 'italic' : 'normal'
    s.style.textDecoration = r.underline ? 'underline' : 'none'
    s.textContent = r.text
    root.append(s)
  }
  ensureEnd(root)
}

function ensureEnd(root: HTMLElement): void {
  // An end marker the browser left in the middle now shows as a real line break: count it as one.
  root.querySelectorAll<HTMLElement>('br[data-end]').forEach((br) => {
    if (br !== root.lastChild) delete br.dataset.end
  })
  const last = root.lastChild
  if (last?.nodeName === 'BR' && (last as HTMLElement).dataset.end) return
  const br = document.createElement('br')
  br.dataset.end = '1'
  root.append(br)
}

/** Selection inside the editor as character offsets, or null when it's elsewhere. */
function getSel(root: HTMLElement): { start: number; end: number } | null {
  const sel = document.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
  const at = (node: Node, off: number): number => {
    let n = 0
    let done = false
    const walk = (cur: Node): void => {
      if (done) return
      if (cur === node) {
        if (cur.nodeType === Node.TEXT_NODE) n += off
        else for (let i = 0; i < off && i < cur.childNodes.length; i++) n += nodeLength(cur.childNodes[i])
        done = true
        return
      }
      if (cur.nodeType === Node.TEXT_NODE || cur.nodeName === 'BR') n += nodeLength(cur)
      else cur.childNodes.forEach(walk)
    }
    walk(root)
    return n
  }
  const a = at(r.startContainer, r.startOffset)
  const b = at(r.endContainer, r.endOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function pointAt(root: HTMLElement, offset: number): [Node, number] {
  let pos = 0
  let found: [Node, number] | null = null
  const walk = (cur: Node): void => {
    if (found) return
    if (cur.nodeType === Node.TEXT_NODE) {
      const len = (cur as Text).data.length
      if (offset <= pos + len) found = [cur, offset - pos]
      pos += len
    } else if (cur.nodeName === 'BR') {
      if (offset <= pos) found = [cur.parentNode!, [...cur.parentNode!.childNodes].indexOf(cur as ChildNode)]
      pos += nodeLength(cur)
    } else cur.childNodes.forEach(walk)
  }
  walk(root)
  return found ?? [root, Math.max(0, root.childNodes.length - 1)]
}

function setSel(root: HTMLElement, start: number, end: number): void {
  const sel = document.getSelection()
  if (!sel) return
  const r = document.createRange()
  const [sn, so] = pointAt(root, start)
  const [en, eo] = pointAt(root, end)
  r.setStart(sn, so)
  r.setEnd(en, eo)
  sel.removeAllRanges()
  sel.addRange(r)
}

interface Panel {
  /** Screen box of the selected characters (or the right-click point) the bar belongs to. */
  x: number
  y: number
  bottom: number
  /** Opened by right-click without a selection: formats the whole text. */
  whole: boolean
}

/** The line the caret is on: where it starts, its whole text and the part before the caret. */
function caretLine(root: HTMLElement, te: { runs: FullRun[] }): { start: number; text: string; before: string } | null {
  const sel = getSel(root)
  if (!sel || sel.start !== sel.end) return null
  const all = te.runs.map((r) => r.text).join('')
  const start = all.lastIndexOf('\n', sel.start - 1) + 1
  const endAt = all.indexOf('\n', sel.start)
  return { start, text: all.slice(start, endAt < 0 ? all.length : endAt), before: all.slice(start, sel.start) }
}

export function TextEditor() {
  const te = useUI((s) => s.textEdit)
  const zoom = useUI((s) => s.camera.zoom)
  const cam = useUI((s) => s.camera)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rendered = useRef<{ zoom: number } | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [, bump] = useState(0)
  const [panelSize, setPanelSize] = useState({ w: 320, h: 80 })
  useLayoutEffect(() => {
    const p = panelRef.current
    if (p && (p.offsetWidth !== panelSize.w || p.offsetHeight !== panelSize.h)) setPanelSize({ w: p.offsetWidth, h: p.offsetHeight })
  })
  const t = useT()
  const session = te ? `${te.id ?? 'new'}:${te.x}:${te.y}` : ''

  // Start of an edit: build the DOM, focus, caret at the end.
  useLayoutEffect(() => {
    const el = ref.current
    const cur = useUI.getState().textEdit
    if (!el || !cur) return
    render(el, cur.runs, zoom)
    rendered.current = { zoom }
    el.focus()
    const len = cur.runs.reduce((n, r) => n + r.text.length, 0)
    setSel(el, len, len)
    setPanel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Runs changed from outside (format bar, text tool options) or zoom changed: rebuild the DOM.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !te) return
    if (rendered.current?.zoom === zoom && sameRuns(parse(el, te), te.runs)) return
    const sel = getSel(el)
    render(el, te.runs, zoom)
    rendered.current = { zoom }
    if (sel) setSel(el, sel.start, sel.end)
  }, [te, zoom])

  // Selecting characters shows the format bar above them; collapsing the selection hides it.
  useEffect(() => {
    if (!te) return
    const onSel = (): void => {
      const el = ref.current
      if (!el) return
      const sel = getSel(el)
      if (!sel || sel.start === sel.end) {
        setPanel((p) => (p?.whole ? p : null))
        return
      }
      const rect = document.getSelection()!.getRangeAt(0).getBoundingClientRect()
      setPanel({ x: rect.left + rect.width / 2, y: rect.top, bottom: rect.bottom, whole: false })
      bump((n) => n + 1)
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [!!te])

  if (!te) return null

  const el = ref.current
  const sel = el ? getSel(el) : null
  const total = te.runs.reduce((n, r) => n + r.text.length, 0)
  const range = panel?.whole || !sel || sel.start === sel.end ? { start: 0, end: total } : sel
  const fmt = commonFormat(te.runs, range.start, range.end)

  const apply = (patch: TextFormat): void => {
    const cur = useUI.getState().textEdit
    if (!cur) return
    const now = ref.current ? getSel(ref.current) : null
    const r = panel?.whole || !now || now.start === now.end ? { start: 0, end: Infinity } : now
    const whole = r.start === 0 && r.end >= total
    useUI.setState({
      textEdit: {
        ...cur,
        // Formatting everything also changes what newly typed text gets.
        ...(whole && patch.color ? { color: patch.color } : {}),
        ...(whole && patch.size ? { size: patch.size } : {}),
        runs: formatRange(cur.runs, r.start, r.end, patch)
      }
    })
  }
  const toggle = (k: 'bold' | 'italic' | 'underline'): void => apply({ [k]: !fmt[k] })
  const size = fmt.size ?? minSize(te)
  const step = (dir: 1 | -1): void => apply({ size: Math.max(6, Math.min(400, Math.round(size + dir * (size < 40 ? 2 : 4)))) })
  const bar = panel ? fitBox({ left: panel.x, right: panel.x, top: panel.y, bottom: panel.bottom }, panelSize.w, panelSize.h, screenArea(), 'above', 10) : null

  return (
    <>
      <div
        ref={ref}
        className="text-editor"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck
        style={{
          left: (te.x - cam.x) * zoom,
          top: (te.y - cam.y) * zoom,
          fontSize: minSize(te) * zoom,
          lineHeight: TEXT_LINE_HEIGHT,
          fontFamily: TEXT_FONT,
          color: shownColor(te.color)
        }}
        onInput={(e) => {
          const root = e.currentTarget
          ensureEnd(root)
          const cur = useUI.getState().textEdit
          if (!cur) return
          useUI.setState({ textEdit: { ...cur, runs: parse(root, cur) } })
          setPanel((p) => (p?.whole ? null : p))
        }}
        onBlur={() => editor.commitText()}
        onContextMenu={(e) => {
          e.preventDefault()
          const s = getSel(e.currentTarget)
          setPanel({ x: e.clientX, y: e.clientY - 12, bottom: e.clientY + 12, whole: !s || s.start === s.end })
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          const mod = e.ctrlKey || e.metaKey
          // Esc or Ctrl+Enter finishes; plain Enter is a new line.
          if (e.code === 'Escape' || ((e.code === 'Enter' || e.code === 'NumpadEnter') && mod)) {
            e.preventDefault()
            if (e.code === 'Escape' && panel) setPanel(null)
            else editor.commitText()
            return
          }
          if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault()
            const root = e.currentTarget
            const line = caretLine(root, useUI.getState().textEdit ?? te)
            const list = line && !e.shiftKey ? continueList(line.text) : null
            if (list?.exit) {
              // Enter on an empty list item ends the list: the marker goes, no new line.
              setSel(root, line!.start, line!.start + line!.text.length)
              document.execCommand('delete')
              return
            }
            // A <br> (not the <div> the browser would make), so lines stay one flat run of text.
            document.execCommand('insertLineBreak')
            if (list) document.execCommand('insertText', false, list.next)
            return
          }
          if (e.code === 'Space' && !mod && !e.altKey) {
            // "- " or "* " at the start of a line becomes a bullet.
            const line = caretLine(e.currentTarget, useUI.getState().textEdit ?? te)
            const bullet = line ? autoBullet(line.before + ' ') : null
            if (bullet) {
              e.preventDefault()
              setSel(e.currentTarget, line!.start, line!.start + line!.before.length)
              document.execCommand('insertText', false, bullet)
              return
            }
          }
          // Ctrl+B / I / U by physical key, so any keyboard layout works.
          const k = mod && !e.altKey ? ({ KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' } as const)[e.code as 'KeyB'] : undefined
          if (k) {
            e.preventDefault()
            toggle(k)
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {panel && (
        <div
          ref={panelRef}
          className="panel text-format"
          style={{ left: bar!.left, top: bar!.top }}
          // Keep the focus and the selected characters in the text box while using the bar.
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="tf-row">
            <button className={`tf-btn ${fmt.bold ? 'active' : ''}`} title={`${t('text.bold')} (Ctrl+B)`} onClick={() => toggle('bold')}>
              <b>B</b>
            </button>
            <button className={`tf-btn ${fmt.italic ? 'active' : ''}`} title={`${t('text.italic')} (Ctrl+I)`} onClick={() => toggle('italic')}>
              <i>I</i>
            </button>
            <button className={`tf-btn ${fmt.underline ? 'active' : ''}`} title={`${t('text.underline')} (Ctrl+U)`} onClick={() => toggle('underline')}>
              <u>U</u>
            </button>
            <span className="tf-sep" />
            <button className="tf-btn" title={t('text.smaller')} onClick={() => step(-1)}>
              −
            </button>
            <span className="tf-size" title={t('text.size')}>
              {Math.round(size)}
            </span>
            <button className="tf-btn" title={t('text.bigger')} onClick={() => step(1)}>
              +
            </button>
          </div>
          <div className="tf-row swatches">
            {PEN_COLORS.map((c) => (
              <button key={c} className={`swatch small ${fmt.color === c ? 'active' : ''}`} style={{ background: c }} title={c} onClick={() => apply({ color: c })} />
            ))}
          </div>
          <div className="tf-hint">{panel.whole || !sel || sel.start === sel.end ? t('text.formatAll') : t('text.formatSel')}</div>
        </div>
      )}
    </>
  )
}
