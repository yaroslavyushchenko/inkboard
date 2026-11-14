import type { ColorMap, Prim } from '@inkboard/render/display'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draws a display list (@inkboard/render/display) on a Canvas 2D context, on screen or offscreen. */
export function paint(ctx: Ctx, p: Prim, color: ColorMap): void {
  switch (p.kind) {
    case 'group':
      ctx.save()
      if (p.fill) ctx.fillStyle = color(p.fill)
      if (p.cap) ctx.lineCap = p.cap
      if (p.join) ctx.lineJoin = p.join
      for (const ch of p.children) paint(ctx, ch, color)
      ctx.restore()
      return
    case 'line':
      ctx.beginPath()
      ctx.moveTo(p.x1, p.y1)
      ctx.lineTo(p.x2, p.y2)
      ctx.lineWidth = p.width
      ctx.strokeStyle = color(p.color)
      ctx.stroke()
      return
    case 'polygon':
    case 'polyline': {
      if (!p.pts.length) return
      ctx.beginPath()
      ctx.moveTo(p.pts[0][0], p.pts[0][1])
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1])
      if (p.kind === 'polygon') {
        ctx.closePath()
        ctx.fillStyle = color(p.color)
        ctx.fill()
        return
      }
      ctx.save()
      if (p.join) ctx.lineJoin = p.join
      ctx.lineWidth = p.width
      ctx.strokeStyle = color(p.color)
      ctx.stroke()
      ctx.restore()
      return
    }
    case 'text':
      ctx.save()
      ctx.font = `${p.italic ? 'italic ' : ''}${p.size}px ${p.family}`
      ctx.textAlign = p.align ?? 'left'
      ctx.textBaseline = p.baseline ?? 'alphabetic'
      if (p.halo) {
        ctx.strokeStyle = color(p.halo.color)
        ctx.lineWidth = p.halo.width
        ctx.lineJoin = 'round'
        ctx.strokeText(p.s, p.x, p.y)
      } else {
        if (p.color) ctx.fillStyle = color(p.color)
        ctx.fillText(p.s, p.x, p.y)
      }
      ctx.restore()
  }
}
