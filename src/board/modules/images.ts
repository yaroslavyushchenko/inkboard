import { getImage } from '../engine/images'
import type { FeatureModule } from '../registry'

const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Pictures pasted or dropped onto the board, kept at their original resolution. */
export const imagesModule: FeatureModule = {
  id: 'images',
  items: {
    image: {
      draw(ctx, it) {
        // Not decoded yet: drawn as soon as it loads (setImageLoadListener redraws the board).
        const img = getImage(it.src)
        if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, it.x, it.y, it.w, it.h)
      },
      svg: (it) => `<image href="${esc(it.src)}" x="${r2(it.x)}" y="${r2(it.y)}" width="${r2(it.w)}" height="${r2(it.h)}" preserveAspectRatio="none"/>`
    }
  }
}
