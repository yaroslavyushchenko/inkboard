import { numericResult } from '../engine/formulaexpr'
import { formulaDisplay } from '../engine/formulatype'
import type { FeatureModule } from '../registry'

/** Formulas typed on the math keypad, and their answers worked out as they are typed. */
export const formulasModule: FeatureModule = {
  id: 'formulas',
  items: { formula: { display: formulaDisplay } },
  formulaEvaluator: { result: numericResult }
}
