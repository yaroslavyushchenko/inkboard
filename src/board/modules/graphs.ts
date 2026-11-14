import { graphDisplay } from '../engine/graph'
import type { FeatureModule } from '../registry'

/** Coordinate lines, planes and 3D axes, with the functions plotted on them. */
export const graphsModule: FeatureModule = {
  id: 'graphs',
  items: { graph: { display: graphDisplay } }
}
