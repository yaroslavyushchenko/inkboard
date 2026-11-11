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

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
)

export const DotsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </svg>
)

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 4h6l-1 6 3 3H7l3-3z" />
    <path d="M12 16v4" />
  </svg>
)

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
)

export const FolderIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
)

export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)

export const ShapesIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="12.5" width="8" height="8" rx="1" />
    <circle cx="16.5" cy="16.5" r="4" />
    <path d="M12 3.5l4.5 7.5h-9z" />
  </svg>
)

export const AxesIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 13h17M18 11l2 2-2 2M10 21V4M8 6l2-2 2 2" />
    <path d="M6 12v2M14 12v2M9 17h2M9 9h2" strokeWidth="1.2" />
  </svg>
)

export const StampIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M8 8h8M8 12h5M8 16h3" />
  </svg>
)

export const BookmarkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 3.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V4.5a1 1 0 0 1 1-1z" />
  </svg>
)

export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10.3 3h3.4l.5 2.4a7 7 0 0 1 1.7 1l2.3-.8 1.7 2.9-1.8 1.6a7 7 0 0 1 0 2l1.8 1.6-1.7 2.9-2.3-.8a7 7 0 0 1-1.7 1l-.5 2.4h-3.4l-.5-2.4a7 7 0 0 1-1.7-1l-2.3.8-1.7-2.9 1.8-1.6a7 7 0 0 1 0-2L4.1 8.5l1.7-2.9 2.3.8a7 7 0 0 1 1.7-1z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
)

export const ProtractorIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 17.5a9.5 9.5 0 0 1 19 0z" />
    <path d="M12 17.5V15M6.2 11.7l1.5 1.5M17.8 11.7l-1.5 1.5M12 9v1.6" strokeWidth="1.4" />
  </svg>
)

export const GroupIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" strokeDasharray="3 2.5" />
    <rect x="7" y="7" width="5" height="5" rx="1" />
    <circle cx="15" cy="15" r="2.5" />
  </svg>
)

export const UngroupIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="9" height="9" rx="1.5" strokeDasharray="3 2.5" />
    <rect x="12" y="12" width="9" height="9" rx="1.5" strokeDasharray="3 2.5" />
    <rect x="5.5" y="5.5" width="4" height="4" rx="0.8" />
    <circle cx="16.5" cy="16.5" r="2" />
  </svg>
)

export const MoveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3.5l10.5 6.2-4.6 1.2 2.9 5.4-2.3 1.2-2.9-5.4L5 15.5z" />
    <path d="M17 15v6M14 18h6M15.5 16.5l1.5-1.5 1.5 1.5M15.5 19.5l1.5 1.5 1.5-1.5" strokeWidth="1.4" />
  </svg>
)

export const KeyboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" />
  </svg>
)

export const StyleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h16" strokeWidth="2.6" />
    <path d="M4 12h16" strokeDasharray="4 3" />
    <path d="M4 18h12" strokeDasharray="0.1 3.4" strokeWidth="2.2" />
    <path d="M17 15.5l3 2.5-3 2.5z" fill="currentColor" />
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
