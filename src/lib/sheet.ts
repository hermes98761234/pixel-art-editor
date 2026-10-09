import type { Sprite } from './sprite'
import { composeFrame } from './sprite'

export interface SheetLayout { width: number; height: number; cols: number; rows: number; cells: { x: number; y: number }[] }

export function layoutSheet(n: number, cols: number, fw: number, fh: number, pad: number): SheetLayout {
  cols = Math.max(1, Math.min(n, Math.floor(cols)))
  const rows = Math.ceil(n / cols)
  const cells = Array.from({ length: n }, (_, i) => ({ x: pad + (i % cols) * (fw + pad), y: pad + Math.floor(i / cols) * (fh + pad) }))
  return { width: pad + cols * (fw + pad), height: pad + rows * (fh + pad), cols, rows, cells }
}

/** Composes every frame into one RGBA sheet (frames at 1x; scale afterwards). */
export function buildSheet(s: Sprite, cols: number, pad: number): { rgba: Uint8ClampedArray; layout: SheetLayout } {
  const layout = layoutSheet(s.frames.length, cols, s.w, s.h, pad)
  const rgba = new Uint8ClampedArray(layout.width * layout.height * 4)
  s.frames.forEach((_, fi) => {
    const px = composeFrame(s, fi)
    const { x, y } = layout.cells[fi]
    for (let r = 0; r < s.h; r++) {
      const src = r * s.w * 4
      rgba.set(px.subarray(src, src + s.w * 4), ((y + r) * layout.width + x) * 4)
    }
  })
  return { rgba, layout }
}

export function sheetJson(s: Sprite, layout: SheetLayout, image: string, scale: number): string {
  return JSON.stringify({
    frames: s.frames.map((f, i) => ({
      filename: `frame_${i}`,
      frame: { x: layout.cells[i].x * scale, y: layout.cells[i].y * scale, w: s.w * scale, h: s.h * scale },
      duration: f.duration,
    })),
    meta: { image, size: { w: layout.width * scale, h: layout.height * scale }, scale },
  }, null, 2)
}
