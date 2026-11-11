import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...p
})

/** Vertical pen like the ones in Whiteboard's ink toolbar; the tip and band take the ink colour. */
export function PenIcon({ color, highlighter }: { color: string; highlighter?: boolean }) {
  return (
    <svg width="26" height="44" viewBox="0 0 26 44" aria-hidden>
      {highlighter ? (
        <>
          <path d="M8 4 h10 v24 l-2 6 h-6 l-2 -6 z" fill="#f4f4f6" stroke="#8a8d96" strokeWidth="1.2" />
          <path d="M10 34 h6 l-1 6 h-4 z" fill={color} stroke="#8a8d96" strokeWidth="1" />
          <rect x="8" y="18" width="10" height="6" fill={color} />
        </>
      ) : (
        <>
          <path d="M9 4 h8 v26 l-4 10 l-4 -10 z" fill="#f4f4f6" stroke="#8a8d96" strokeWidth="1.2" />
          <path d="M10.6 34 h4.8 l-2.4 6 z" fill={color} />
          <rect x="9" y="20" width="8" height="5" fill={color} />
        </>
      )}
    </svg>
  )
}

export const EraserIcon = () => (
  <svg width="26" height="44" viewBox="0 0 26 44" aria-hidden>
    <path d="M7 6 h12 v22 h-12 z" fill="#f4f4f6" stroke="#8a8d96" strokeWidth="1.2" />
    <path d="M7 28 h12 v10 a2 2 0 0 1 -2 2 h-8 a2 2 0 0 1 -2 -2 z" fill="#ff8fa3" stroke="#8a8d96" strokeWidth="1.2" />
  </svg>
)

export const HandIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5" />
    <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6" />
    <path d="M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4 14.5a1.5 1.5 0 0 1 2.3-1.9L7 13.5V11" />
  </svg>
)

export const LassoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7.5 17.5C4.5 16.3 3 14.4 3 12c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8c-.9 0-1.8-.1-2.6-.3" strokeDasharray="2.6 2.4" />
    <circle cx="7.5" cy="18.5" r="1.6" />
    <path d="M7.5 20.1c0 1.2.8 1.9 2 1.9" />
  </svg>
)

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
)

export const DuplicateIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
)

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const ImageIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </svg>
)

export const UndoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)

export const RedoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const MinusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
)

export const PaperIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    {[8, 12, 16].map((y) => [8, 12, 16].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="currentColor" />))}
  </svg>
)
