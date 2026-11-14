import { holdShape, recognizeShape, type Snapped } from '@inkboard/shape-recognition/snapshape'
import type { FeatureModule } from '../registry'

/**
 * Hold-to-snap: keep the pen still at the end of a stroke and a rough circle, oval, arc, rectangle,
 * square or triangle becomes a clean one (the recognisers are in @inkboard/shape-recognition).
 * Without this module strokes simply stay as drawn.
 */
export const shapeRecognitionModule: FeatureModule = {
  id: 'shape-recognition',
  strokeRecognizer: {
    recognize: recognizeShape,
    // Only shapes this recogniser made come back here, so they are its own Snapped shapes.
    reshape: (base, from, to, perfect) => holdShape(base as Snapped, from, to, perfect)
  }
}
