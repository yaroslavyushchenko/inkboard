import { clampZoom, screenToWorld, zoomAt } from './engine/camera'
import { newId } from './engine/geometry'
import { loadImage, readFileAsDataURL } from './engine/images'
import { Scene } from './engine/scene'
import type { Camera, ImageItem } from './engine/types'
import { useUI } from './store'

/**
 * Glue between the imperative board engine and the React UI.
 * UI components call these methods; the Board component registers the render callback.
 */
class Editor {
  readonly scene = new Scene()
  camera: Camera = { x: -80, y: -80, zoom: 1 }
  viewport = { width: 0, height: 0 }
  private invalidate: (base?: boolean) => void = () => {}

  constructor() {
    this.scene.subscribe(() => {
      useUI.setState({ canUndo: this.scene.canUndo, canRedo: this.scene.canRedo })
      this.invalidate(true)
    })
    useUI.subscribe((s, prev) => {
      if (s.background !== prev.background) this.invalidate(true)
      else this.invalidate(false)
    })
  }

  attach(invalidate: (base?: boolean) => void): () => void {
    this.invalidate = invalidate
    return () => {
      this.invalidate = () => {}
    }
  }

  requestRender(base = true): void {
    this.invalidate(base)
  }

  setCamera(cam: Camera): void {
    this.camera = cam
    if (useUI.getState().zoom !== cam.zoom) useUI.setState({ zoom: cam.zoom })
    this.invalidate(true)
  }

  zoomBy(factor: number): void {
    const { width, height } = this.viewport
    this.setCamera(zoomAt(this.camera, width / 2, height / 2, this.camera.zoom * factor))
  }

  /** Step through "nice" zoom levels, like the +/- buttons in Whiteboard. */
  zoomStep(dir: 1 | -1): void {
    const levels = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 20]
    const z = this.camera.zoom
    const next =
      dir > 0 ? levels.find((l) => l > z + 1e-3) : [...levels].reverse().find((l) => l < z - 1e-3)
    this.zoomBy(clampZoom(next ?? z) / z)
  }

  resetZoom(): void {
    this.zoomBy(1 / this.camera.zoom)
  }

  undo(): void {
    this.scene.undo()
  }

  redo(): void {
    this.scene.redo()
  }

  /** Insert image files at a screen point (defaults to the viewport centre). */
  async insertImages(files: File[], sx?: number, sy?: number): Promise<void> {
    const images = files.filter((f) => f.type.startsWith('image/'))
    let offset = 0
    for (const file of images) {
      const src = await readFileAsDataURL(file)
      const img = await loadImage(src)
      const cam = this.camera
      const { width, height } = this.viewport
      const center = screenToWorld(cam, sx ?? width / 2, sy ?? height / 2)
      // Fit into ~60% of the visible area, never upscale. The original pixels are kept as-is.
      const maxW = (width / cam.zoom) * 0.6
      const maxH = (height / cam.zoom) * 0.6
      const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      const x = center.x - w / 2 + offset
      const y = center.y - h / 2 + offset
      offset += 24 / cam.zoom
      const item: ImageItem = {
        type: 'image',
        id: newId(),
        z: this.scene.allocZ(),
        src,
        x,
        y,
        w,
        h,
        bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h }
      }
      this.scene.add([item])
    }
  }
}

export const editor = new Editor()
