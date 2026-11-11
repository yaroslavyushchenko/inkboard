import { useEffect, useRef } from 'react'
import { editor } from '../editor'
import { TEXT_FONT, TEXT_LINE_HEIGHT } from '../engine/text'
import { useUI } from '../store'

/**
 * The text box shown while typing on the board. It sits exactly where the text will be drawn
 * (same font, size and colour), so what you type is what you get.
 */
export function TextEditor() {
  const te = useUI((s) => s.textEdit)
  const cam = useUI((s) => s.camera)
  const ref = useRef<HTMLTextAreaElement>(null)
  const editing = !!te
  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing, te?.id])
  if (!te) return null
  const zoom = cam.zoom
  return (
    <textarea
      ref={ref}
      className="text-editor"
      spellCheck
      value={te.text}
      style={{
        left: (te.x - cam.x) * zoom,
        top: (te.y - cam.y) * zoom,
        fontSize: te.size * zoom,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: TEXT_FONT,
        color: te.color
      }}
      onChange={(e) => useUI.setState({ textEdit: { ...te, text: e.target.value } })}
      onBlur={() => editor.commitText()}
      onKeyDown={(e) => {
        // Esc or Ctrl+Enter finishes; plain Enter is a new line.
        if (e.code === 'Escape' || ((e.code === 'Enter' || e.code === 'NumpadEnter') && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          editor.commitText()
        }
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
