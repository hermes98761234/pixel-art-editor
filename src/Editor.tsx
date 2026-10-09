import { useEffect, useRef } from 'react'
import { composeFrame, setCel, tintRgba, type Sprite } from './lib/sprite'
import { copyRegion, clearRegion, ellipsePoints, floodFill, linePoints, normRect, pasteRegion, rectPoints, type Pt, type Rect } from './lib/draw'
import { drawScaled } from './lib/canvas'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'rectf' | 'ellipse' | 'ellipsef' | 'select' | 'picker'

interface Props {
  sprite: Sprite
  f: number
  l: number
  tool: Tool
  color: number
  brush: number
  mirror: boolean
  zoom: number
  grid: boolean
  onion: boolean
  sel: Rect | null
  setSel: (r: Rect | null) => void
  onLive: (s: Sprite | null) => void
  onCommit: (s: Sprite) => void
  onPick: (c: number) => void
}

type Drag =
  | { kind: 'free'; last: Pt; work: Uint32Array }
  | { kind: 'shape'; start: Pt; base: Uint32Array; work: Uint32Array | null }
  | { kind: 'selnew'; start: Pt }
  | { kind: 'selmove'; start: Pt; cleared: Uint32Array; lifted: Uint32Array; orig: Rect; work: Uint32Array }

export default function Editor(p: Props) {
  const { sprite, f, l, zoom } = p
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const c = ref.current!
    c.width = sprite.w * zoom
    c.height = sprite.h * zoom
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    if (p.onion) {
      if (f > 0) drawScaled(ctx, tintRgba(composeFrame(sprite, f - 1), [255, 60, 60], 0.4), sprite.w, sprite.h, zoom)
      if (f < sprite.frames.length - 1) drawScaled(ctx, tintRgba(composeFrame(sprite, f + 1), [60, 120, 255], 0.4), sprite.w, sprite.h, zoom)
    }
    drawScaled(ctx, composeFrame(sprite, f), sprite.w, sprite.h, zoom)
    if (p.grid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(128,128,128,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 1; x < sprite.w; x++) { ctx.moveTo(x * zoom + 0.5, 0); ctx.lineTo(x * zoom + 0.5, c.height) }
      for (let y = 1; y < sprite.h; y++) { ctx.moveTo(0, y * zoom + 0.5); ctx.lineTo(c.width, y * zoom + 0.5) }
      ctx.stroke()
    }
    if (p.sel) {
      ctx.strokeStyle = '#000'
      ctx.setLineDash([4, 4])
      ctx.strokeRect(p.sel.x * zoom + 0.5, p.sel.y * zoom + 0.5, p.sel.w * zoom - 1, p.sel.h * zoom - 1)
      ctx.strokeStyle = '#fff'
      ctx.lineDashOffset = 4
      ctx.strokeRect(p.sel.x * zoom + 0.5, p.sel.y * zoom + 0.5, p.sel.w * zoom - 1, p.sel.h * zoom - 1)
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }
  }, [sprite, f, zoom, p.onion, p.grid, p.sel])

  const pos = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect()
    return { x: Math.floor(((e.clientX - r.left) / r.width) * sprite.w), y: Math.floor(((e.clientY - r.top) / r.height) * sprite.h) }
  }
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < sprite.w && y < sprite.h
  const col = p.tool === 'eraser' ? 0 : p.color
  const put = (cel: Uint32Array, x: number, y: number, c: number) => {
    const o = Math.floor((p.brush - 1) / 2)
    const stamp = (cx: number) => {
      for (let j = 0; j < p.brush; j++) for (let i = 0; i < p.brush; i++) {
        const px = cx - o + i, py = y - o + j
        if (inb(px, py)) cel[py * sprite.w + px] = c
      }
    }
    stamp(x)
    if (p.mirror) stamp(sprite.w - 1 - x)
  }
  const putAll = (cel: Uint32Array, pts: Pt[], c: number, brush = true) => {
    for (const q of pts) {
      if (brush) put(cel, q.x, q.y, c)
      else if (inb(q.x, q.y)) { cel[q.y * sprite.w + q.x] = c; if (p.mirror && inb(sprite.w - 1 - q.x, q.y)) cel[q.y * sprite.w + sprite.w - 1 - q.x] = c }
    }
  }
  const baseCel = () => sprite.frames[f].cels[l]
  const live = (cel: Uint32Array) => p.onLive(setCel(sprite, f, l, cel))

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const q = pos(e)
    const t = p.tool
    if (t === 'picker') {
      const px = composeFrame(sprite, f)
      if (inb(q.x, q.y)) {
        const i = (q.y * sprite.w + q.x) * 4
        if (px[i + 3]) p.onPick(((px[i + 3] << 24) | (px[i + 2] << 16) | (px[i + 1] << 8) | px[i]) >>> 0)
      }
      return
    }
    if (t === 'fill') {
      const cel = baseCel().slice()
      if (floodFill(cel, sprite.w, sprite.h, q.x, q.y, p.color)) p.onCommit(setCel(sprite, f, l, cel))
      return
    }
    if (t === 'pencil' || t === 'eraser') {
      const work = baseCel().slice()
      put(work, q.x, q.y, col)
      drag.current = { kind: 'free', last: q, work }
      live(work)
      return
    }
    if (t === 'select') {
      const s = p.sel
      if (s && q.x >= s.x && q.y >= s.y && q.x < s.x + s.w && q.y < s.y + s.h) {
        const cleared = baseCel().slice()
        const lifted = copyRegion(cleared, sprite.w, s)
        clearRegion(cleared, sprite.w, s)
        drag.current = { kind: 'selmove', start: q, cleared, lifted, orig: s, work: cleared }
      } else {
        p.setSel(null)
        drag.current = { kind: 'selnew', start: q }
      }
      return
    }
    drag.current = { kind: 'shape', start: q, base: baseCel(), work: null }
    shape(q, q)
  }
  const shape = (a: Pt, b: Pt) => {
    const d = drag.current
    if (!d || d.kind !== 'shape') return
    const work = d.base.slice()
    const t = p.tool
    const pts = t === 'line' ? linePoints(a.x, a.y, b.x, b.y) : t === 'rect' || t === 'rectf' ? rectPoints(a.x, a.y, b.x, b.y, t === 'rectf') : ellipsePoints(a.x, a.y, b.x, b.y, t === 'ellipsef')
    putAll(work, pts, p.color, t === 'line' || t === 'rect' || t === 'ellipse' ? true : false)
    d.work = work
    live(work)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const q = pos(e)
    if (d.kind === 'free') {
      putAll(d.work, linePoints(d.last.x, d.last.y, q.x, q.y), col)
      d.last = q
      live(d.work)
    } else if (d.kind === 'shape') shape(d.start, q)
    else if (d.kind === 'selnew') p.setSel(normRect(d.start.x, d.start.y, q.x, q.y, sprite.w, sprite.h))
    else {
      const work = d.cleared.slice()
      const dx = q.x - d.start.x, dy = q.y - d.start.y
      pasteRegion(work, sprite.w, sprite.h, d.lifted, d.orig.w, d.orig.h, d.orig.x + dx, d.orig.y + dy)
      d.work = work
      p.setSel({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy })
      live(work)
    }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'free') p.onCommit(setCel(sprite, f, l, d.work))
    else if (d.kind === 'shape') { if (d.work) p.onCommit(setCel(sprite, f, l, d.work)) }
    else if (d.kind === 'selmove') { if (d.work !== d.cleared) p.onCommit(setCel(sprite, f, l, d.work)) }
    else if (p.sel && (p.sel.w < 1 || p.sel.h < 1)) p.setSel(null)
  }

  return (
    <div className="editor-wrap">
      <canvas ref={ref} className="checker editor-canvas" style={{ width: sprite.w * zoom, height: sprite.h * zoom, cursor: p.tool === 'select' ? 'crosshair' : 'cell' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    </div>
  )
}
