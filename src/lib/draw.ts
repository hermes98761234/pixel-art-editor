export interface Pt { x: number; y: number }

export function linePoints(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pts: Pt[] = []
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0, y = y0
  for (;;) {
    pts.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return pts
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Pt[] {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)]
  const [c, d] = [Math.min(y0, y1), Math.max(y0, y1)]
  const pts: Pt[] = []
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (filled || x === a || x === b || y === c || y === d) pts.push({ x, y })
  return pts
}

/** Ellipse inscribed in the bounding box of the two corners (pixel-centre sampling). */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Pt[] {
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1)
  const w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1
  const inside = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false
    const nx = (i + 0.5 - w / 2) / (w / 2), ny = (j + 0.5 - h / 2) / (h / 2)
    return nx * nx + ny * ny <= 1
  }
  const pts: Pt[] = []
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inside(i, j)) continue
    if (filled || !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1)) pts.push({ x: ax + i, y: ay + j })
  }
  return pts
}

/** Scanline flood fill (4-connected, exact colour match). Mutates the cel; returns the number of pixels changed. */
export function floodFill(cel: Uint32Array, w: number, h: number, x: number, y: number, color: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0
  const target = cel[y * w + x]
  if (target === color) return 0
  let count = 0
  const stack: number[] = [x, y]
  while (stack.length) {
    const cy = stack.pop()!
    let cx = stack.pop()!
    while (cx >= 0 && cel[cy * w + cx] === target) cx--
    cx++
    let up = false, down = false
    while (cx < w && cel[cy * w + cx] === target) {
      cel[cy * w + cx] = color
      count++
      if (cy > 0) { const m = cel[(cy - 1) * w + cx] === target; if (m && !up) stack.push(cx, cy - 1); up = m }
      if (cy < h - 1) { const m = cel[(cy + 1) * w + cx] === target; if (m && !down) stack.push(cx, cy + 1); down = m }
      cx++
    }
  }
  return count
}

export interface Rect { x: number; y: number; w: number; h: number }
export function normRect(x0: number, y0: number, x1: number, y1: number, w: number, h: number): Rect {
  const a = Math.max(0, Math.min(x0, x1)), b = Math.min(w - 1, Math.max(x0, x1))
  const c = Math.max(0, Math.min(y0, y1)), d = Math.min(h - 1, Math.max(y0, y1))
  return { x: a, y: c, w: Math.max(0, b - a + 1), h: Math.max(0, d - c + 1) }
}
export function copyRegion(cel: Uint32Array, w: number, r: Rect): Uint32Array {
  const out = new Uint32Array(r.w * r.h)
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) out[y * r.w + x] = cel[(r.y + y) * w + r.x + x]
  return out
}
export function clearRegion(cel: Uint32Array, w: number, r: Rect): void {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) cel[(r.y + y) * w + r.x + x] = 0
}
/** Pastes a buffer at (px,py); transparent source pixels are skipped, out-of-bounds are clipped. */
export function pasteRegion(cel: Uint32Array, w: number, h: number, buf: Uint32Array, bw: number, bh: number, px: number, py: number): void {
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const tx = px + x, ty = py + y
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue
    const c = buf[y * bw + x]
    if (c >>> 24) cel[ty * w + tx] = c
  }
}
