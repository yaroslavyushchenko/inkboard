import { useEffect, useRef, type ReactNode } from 'react'

/** Floating panel that closes on outside click or Escape. */
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
