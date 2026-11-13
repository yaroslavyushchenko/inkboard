/**
 * Telling a mouse wheel from a touchpad. Browsers report both as `wheel` events, so this looks at
 * the signs each leaves:
 * - a mouse wheel moves in notches: whole lines (`deltaMode` 1) or `wheelDeltaY` in steps of 120;
 * - a touchpad scrolls smoothly in small pixel steps and often sideways too.
 *
 * Single events can look like either, so the verdict is taken once per scroll gesture (events with
 * short pauses between them) and kept until it ends: one two-finger swipe never half zooms and
 * half scrolls. Sideways movement turns a gesture into a touchpad one.
 */

export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  /** Legacy Chromium field: ±120 per notch of a mouse wheel. */
  wheelDeltaY?: number
  timeStamp: number
}

/** A pause longer than this starts a new gesture (ms). Touchpad momentum keeps events coming. */
export const WHEEL_GESTURE_GAP = 200

/** What this single event looks like on its own. */
export function looksLikeMouse(e: WheelLike): boolean {
  if (e.deltaX !== 0) return false
  if (e.deltaMode !== 0) return true
  const w = e.wheelDeltaY
  return typeof w === 'number' && w !== 0 && w % 120 === 0
}

export class WheelSource {
  private last = -Infinity
  private mouse = false

  /** true = treat this event as a mouse wheel, false = as a touchpad. */
  isMouse(e: WheelLike): boolean {
    if (e.timeStamp - this.last > WHEEL_GESTURE_GAP) this.mouse = looksLikeMouse(e)
    else if (e.deltaX !== 0) this.mouse = false
    this.last = e.timeStamp
    return this.mouse
  }
}
