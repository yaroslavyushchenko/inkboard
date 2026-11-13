import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fitBox, screenArea } from './dock'

/** Popovers on screen now; opening one closes the others (except ones it sits inside). */
const open = new Set<{ el: HTMLElement; close: () => void }>()

/**
 * Floating panel that closes on outside click or Escape. Clicks on menu buttons
 * (`data-popover-anchor`) don't close it, so a button can toggle its own popover; only one
 * popover is open at a time, so another menu button still replaces it.
 *
 * `fit` (for popovers of things on the board, which can sit anywhere): placed next to its
 * `.menu-anchor` on the side with room, kept inside the window, scrolling when it is too tall.
 */
export function Popover({
  onClose,
  className,
  fit,
  toolbar,
  children
}: {
  onClose: () => void
  className?: string
  fit?: 'above' | 'below'
  toolbar?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (toolbar) setHost(marker.current?.closest('header.toolbar') ?? null)
  }, [toolbar])
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = ref.current
    if (!el) return
    for (const o of [...open]) if (!o.el.contains(el)) o.close()
    const me = { el, close: () => closeRef.current() }
    open.add(me)
    return () => {
      open.delete(me)
    }
  }, [host])
  useEffect(() => {
    const down = (e: PointerEvent): void => {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && !(t as HTMLElement).closest?.('[data-popover-anchor]')) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  // Runs after every render: the anchor follows the board, so the best place changes with it.
  useLayoutEffect(() => {
    const el = ref.current
    const anchor = toolbar ? marker.current?.parentElement : el?.parentElement
    if (!fit || !el || !anchor) return
    const place = (): void => {
      el.style.maxHeight = ''
      const a = anchor.getBoundingClientRect()
      const origin = host?.getBoundingClientRect() ?? a
      const viewport = anchor.closest('.toolbar-viewport')?.getBoundingClientRect()
      if (viewport && (a.right <= viewport.left || a.left >= viewport.right)) {
        closeRef.current()
        return
      }
      const f = fitBox(a, el.offsetWidth, el.offsetHeight, screenArea(), fit)
      Object.assign(el.style, {
        left: `${f.left - origin.left - (host?.clientLeft ?? 0)}px`,
        top: `${f.top - origin.top - (host?.clientTop ?? 0)}px`,
        bottom: 'auto',
        transform: 'none',
        maxHeight: `${f.maxHeight}px`,
        overflowY: 'auto'
      })
    }
    place()
    window.addEventListener('resize', place)
    const viewport = toolbar ? anchor.closest('.toolbar-viewport') : null
    viewport?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
    }
  })
  const content = (
    <div ref={ref} className={`panel popover ${className ?? ''}`}>
      {children}
    </div>
  )
  return toolbar ? <><span ref={marker} hidden />{host && createPortal(content, host)}</> : content
}
