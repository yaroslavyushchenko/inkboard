import type { FeatureModule } from '../registry'
import { formulasModule } from './formulas'
import { graphsModule } from './graphs'
import { imagesModule } from './images'
import { shapeRecognitionModule } from './shapeRecognition'
import { strokesModule } from './strokes'
import { textModule } from './text'

/**
 * Everything Inkboard does today, as modules. An app passes the ones it wants to createEditor();
 * leaving one out removes the feature (a module that owns an item type also takes away the ability
 * to show such items, so leave item modules in and switch features off in their UI instead).
 */
export const builtinModules: readonly FeatureModule[] = [
  strokesModule,
  imagesModule,
  textModule,
  graphsModule,
  formulasModule,
  shapeRecognitionModule
]

export { formulasModule, graphsModule, imagesModule, shapeRecognitionModule, strokesModule, textModule }
