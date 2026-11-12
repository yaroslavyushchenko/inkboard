import type { ReactNode } from 'react'
import type { FormulaLayout } from '../engine/formulatype'
import { MATH_FONT, type MathMark } from '../engine/mathtype'

/** The dotted square of an empty slot. */
function Hole({ m, ghost }: { m: MathMark; ghost?: boolean }) {
  return (
    <rect
      x={m.x}
      y={m.y - m.asc}
      width={m.w}
      height={m.asc + m.desc}
      rx={m.w * 0.08}
      fill="none"
      stroke="currentColor"
      strokeOpacity={ghost ? 0.35 : 0.55}
      strokeWidth={Math.max(0.8, m.w * 0.06)}
      strokeDasharray={`${m.w * 0.1} ${m.w * 0.1}`}
    />
  )
}

/**
 * A typeset formula as SVG (the same primitives the board draws on canvas). `pad` is the free
 * space around it; the baseline is at y = pad + ascent. Children are drawn in formula coordinates
 * (origin at the left end of the baseline): the editor puts its caret there.
 */
export function MathSvg({
  lay,
  pad = 0,
  holes = true,
  fit,
  className,
  children
}: {
  lay: FormulaLayout
  pad?: number
  holes?: boolean
  /** Scale down to fit this box (key faces); never scaled up. */
  fit?: { w: number; h: number }
  className?: string
  children?: ReactNode
}) {
  const b = lay.box
  const w = b.w + pad * 2
  const h = b.asc + b.desc + pad * 2
  const k = fit ? Math.min(1, fit.w / w, fit.h / h) : 1
  return (
    <svg className={className} width={w * k} height={h * k} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <g transform={`translate(${pad} ${pad + b.asc})`} fill="currentColor" stroke="none">
        {b.texts.map((t, i) => (
          <text key={i} x={t.x} y={t.y} fontSize={t.size} fontFamily={MATH_FONT} fontStyle={t.italic ? 'italic' : 'normal'}>
            {t.s}
          </text>
        ))}
        {b.lines.map((l, i) => (
          <polyline key={`l${i}`} points={l.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={l.w} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {holes && lay.holes.map((m, i) => <Hole key={`h${i}`} m={m} />)}
        {holes && lay.ghosts.map((m, i) => <Hole key={`g${i}`} m={m} ghost />)}
        {children}
      </g>
    </svg>
  )
}
