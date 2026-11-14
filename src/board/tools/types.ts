import type { Scene } from '@inkboard/core/scene'
import type { Editor } from '../editor'
import type { SessionStore } from '../session'
import type { Prefs } from '../store'

/**
 * Tool controllers: each tool handles its own press, drag and release, so the board component only
 * turns DOM pointer events into samples and hands them to the tool in charge (docs/ARCHITECTURE.md).
 * Nothing here touches the DOM, so a React Native board could drive the same tools.
 *
 * Moved so far: eraser, brush select, laser. The other tools still live in ui/Board.tsx.
 */

/** One pointer position: on screen (CSS px from the board's corner) and on the board (world units). */
export interface Sample {
  sx: number
  sy: number
  x: number
  y: number
  /** Pen pressure 0..1 (0.5 for a mouse). */
  pressure: number
  /** performance.now() when it happened. */
  time: number
}

/** Keys held during a press; tools read them at the start of a gesture. */
export interface Modifiers {
  shift: boolean
  /** Ctrl, or Cmd on a Mac. */
  ctrl: boolean
  alt: boolean
}

/** What a tool may use: the board's editor and stores, and a way to ask for a redraw. */
export interface ToolContext {
  editor: Editor
  scene: Scene
  session: SessionStore
  prefs: () => Prefs
  /** Redraw the board (base = the committed items too, not only the overlay). */
  invalidate: (base?: boolean) => void
}

/** A press in progress. The board feeds it every sample until the pointer is released. */
export interface Gesture {
  /** New samples since the last call (coalesced pointer events), oldest first. */
  move(samples: readonly Sample[]): void
  /** The pointer was released (or the gesture was cut short): commit what it did. */
  end(): void
}
