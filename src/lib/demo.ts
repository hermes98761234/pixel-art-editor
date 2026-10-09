import { pack } from './color'
import { ellipsePoints } from './draw'
import { addFrame, addLayer, newSprite, setCel, setDuration, updateLayer, type Sprite } from './sprite'

/** A bouncing slime: 16x16, two layers, six frames. */
export function demoSprite(): Sprite {
  const W = 16, H = 16
  let s = newSprite(W, H)
  s = updateLayer(s, 0, { name: 'Shadow' })
  s = addLayer(s, 0)
  s = updateLayer(s, 1, { name: 'Slime' })
  for (let i = 1; i < 6; i++) s = addFrame(s, i - 1)
  const heights = [8, 9, 10, 9, 8, 7]
  const lifts = [0, 1, 2, 3, 1, 0]
  const dark = pack(40, 90, 50), body = pack(90, 200, 90), hi = pack(190, 255, 190), eye = pack(20, 20, 40), shadow = pack(0, 0, 0, 90)
  for (let f = 0; f < 6; f++) {
    const sh = new Uint32Array(W * H)
    const sw = 12 - lifts[f] * 1
    for (const p of ellipsePoints(8 - sw / 2 | 0, 14, (8 - sw / 2 | 0) + sw - 1, 15, true)) sh[p.y * W + p.x] = shadow
    s = setCel(s, f, 0, sh)
    const cel = new Uint32Array(W * H)
    const h = heights[f], wd = 14 - (h - 8)
    const x0 = Math.floor((W - wd) / 2), y1 = 13 - lifts[f], y0 = y1 - h + 1
    for (const p of ellipsePoints(x0, y0, x0 + wd - 1, y1, true)) cel[p.y * W + p.x] = body
    for (const p of ellipsePoints(x0, y0, x0 + wd - 1, y1, false)) cel[p.y * W + p.x] = dark
    cel[(y0 + 2) * W + x0 + 3] = hi; cel[(y0 + 2) * W + x0 + 4] = hi; cel[(y0 + 3) * W + x0 + 3] = hi
    const ey = y0 + Math.floor(h / 2)
    cel[ey * W + 5] = eye; cel[(ey + 1) * W + 5] = eye; cel[ey * W + 10] = eye; cel[(ey + 1) * W + 10] = eye
    s = setCel(s, f, 1, cel)
    s = setDuration(s, f, f === 5 ? 160 : 110)
  }
  return s
}
