import { useEffect, useRef, type ReactNode } from 'react'

/** Popovers on screen now; opening one closes the others (except ones it sits inside). */
const open = new Set<{ el: HTMLElement; close: () => void }>()

/**
 * Floating panel that closes on outside click or Escape. Clicks on menu buttons
 * (`data-popover-anchor`) don't close it, so a button can toggle its own popover; only one
 * popover is open at a time, so another menu button still replaces it.
 */
export function Popover({
  onClose,
  className,
  children
}: {
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
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
  }, [])
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
  return (
    <div ref={ref} className={`panel popover ${className ?? ''}`}>
      {children}
    </div>
  )
}
