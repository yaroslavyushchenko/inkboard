/**
 * User preferences for the on-board protractor (kept with the other settings, not in board files:
 * the instruments are drawing aids, not board content).
 */
export interface InstrumentPrefs {
  /** Protractor snap step in degrees; 0 = no snapping. */
  protStep: 0 | 1 | 5 | 15
}

export const PROT_STEPS = [0, 1, 5, 15] as const

export const DEFAULT_INSTRUMENTS: InstrumentPrefs = { protStep: 1 }

/** Saved preferences, with anything unknown replaced by the default. */
export function cleanInstrumentPrefs(v: unknown): InstrumentPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    protStep: (PROT_STEPS as readonly unknown[]).includes(o.protStep) ? (o.protStep as InstrumentPrefs['protStep']) : DEFAULT_INSTRUMENTS.protStep
  }
}
