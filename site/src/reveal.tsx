import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.18 })
    document.querySelectorAll('.rv, .tile').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
}

export function Count({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [count, setCount] = useState(value)
  useEffect(() => {
    const node = ref.current
    if (!node || value === 0 || reducedMotion()) return
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const step = (time: number) => {
        const progress = Math.min(1, (time - start) / 1100)
        setCount(Math.round(value * (1 - Math.pow(1 - progress, 3))))
        if (progress < 1) frame = requestAnimationFrame(step)
      }
      setCount(0)
      frame = requestAnimationFrame(step)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value])
  return <span ref={ref}>{count}</span>
}
