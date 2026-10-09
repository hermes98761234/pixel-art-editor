import { describe, expect, it } from 'vitest'
import { pack, unpack, parseHex, toHex } from './color'
import { ellipsePoints, floodFill, linePoints, rectPoints, normRect, copyRegion, pasteRegion, clearRegion } from './draw'
import { addFrame, addLayer, composeFrame, deserialize, moveFrame, newSprite, removeLayer, scaleRgba, serialize, setCel, tintRgba } from './sprite'
import { buildSheet, layoutSheet, sheetJson } from './sheet'
import { encodeGif, lzwEncode, quantize } from './gif'
import { demoSprite } from './demo'

describe('color', () => {
  it('packs and unpacks', () => {
    expect(unpack(pack(1, 2, 3, 4))).toEqual([1, 2, 3, 4])
    expect(pack(255, 0, 0)).toBe(0xff0000ff)
  })
  it('parses hex', () => {
    expect(parseHex('#f00')).toBe(pack(255, 0, 0))
    expect(parseHex('00ff0080')).toBe(pack(0, 255, 0, 128))
    expect(parseHex('zzz')).toBeNull()
    expect(toHex(pack(18, 52, 86))).toBe('#123456')
  })
})

describe('draw', () => {
  it('bresenham diagonal and horizontal', () => {
    expect(linePoints(0, 0, 3, 3)).toEqual([0, 1, 2, 3].map((i) => ({ x: i, y: i })))
    expect(linePoints(3, 0, 0, 0).map((p) => p.x)).toEqual([3, 2, 1, 0])
    expect(linePoints(0, 0, 5, 2)).toHaveLength(6)
  })
  it('rect outline and filled counts', () => {
    expect(rectPoints(1, 1, 4, 3, true)).toHaveLength(12)
    expect(rectPoints(1, 1, 4, 3, false)).toHaveLength(10)
    expect(rectPoints(4, 3, 1, 1, true)).toHaveLength(12)
  })
  it('ellipse is symmetric and 5x5 circle has 21 filled px', () => {
    expect(ellipsePoints(0, 0, 4, 4, true)).toHaveLength(21)
    const pts = ellipsePoints(0, 0, 8, 4, false)
    const set = new Set(pts.map((p) => `${p.x},${p.y}`))
    for (const p of pts) expect(set.has(`${8 - p.x},${4 - p.y}`)).toBe(true)
    expect(ellipsePoints(2, 2, 2, 2, true)).toEqual([{ x: 2, y: 2 }])
  })
  it('flood fill respects borders', () => {
    const w = 5, h = 5
    const cel = new Uint32Array(w * h)
    for (let i = 0; i < 5; i++) cel[2 * w + i] = 7 // wall across the middle
    expect(floodFill(cel, w, h, 0, 0, 9)).toBe(10)
    expect(cel[4 * w]).toBe(0)
    expect(floodFill(cel, w, h, 0, 0, 9)).toBe(0)
    expect(floodFill(cel, w, h, 0, 4, 3)).toBe(10)
  })
  it('region copy/clear/paste', () => {
    const cel = new Uint32Array(16)
    cel[5] = pack(1, 0, 0); cel[6] = pack(2, 0, 0)
    const r = normRect(1, 1, 2, 1, 4, 4)
    expect(r).toEqual({ x: 1, y: 1, w: 2, h: 1 })
    const buf = copyRegion(cel, 4, r)
    expect([...buf]).toEqual([pack(1, 0, 0), pack(2, 0, 0)])
    clearRegion(cel, 4, r)
    expect(cel[5]).toBe(0)
    pasteRegion(cel, 4, 4, buf, 2, 1, 3, 3)
    expect(cel[15]).toBe(pack(1, 0, 0)) // (3,3); second pixel clipped
  })
})

describe('sprite', () => {
  it('composites layers with opacity', () => {
    let s = newSprite(2, 1)
    s = addLayer(s, 0)
    s = setCel(s, 0, 0, Uint32Array.of(pack(255, 0, 0), 0))
    s = setCel(s, 0, 1, Uint32Array.of(pack(0, 0, 255), pack(0, 255, 0)))
    s = { ...s, layers: [s.layers[0], { ...s.layers[1], opacity: 0.5 }] }
    const px = composeFrame(s, 0)
    expect([...px.slice(0, 4)]).toEqual([128, 0, 128, 255]) // 50% blue over red
    expect([...px.slice(4, 8)]).toEqual([0, 255, 0, 128])
  })
  it('layer/frame ops keep cels aligned', () => {
    let s = demoSprite()
    expect(s.frames).toHaveLength(6)
    expect(s.layers.map((l) => l.name)).toEqual(['Shadow', 'Slime'])
    s = removeLayer(s, 0)
    expect(s.frames.every((f) => f.cels.length === 1)).toBe(true)
    s = addFrame(s, 0)
    expect(s.frames[1].cels[0]).not.toBe(s.frames[0].cels[0])
    expect([...s.frames[1].cels[0]]).toEqual([...s.frames[0].cels[0]])
    expect(moveFrame(s, 0, -1)).toBe(s)
  })
  it('serialize round-trips', () => {
    const s = demoSprite()
    const t = deserialize(serialize(s))
    expect(t.w).toBe(16)
    expect(t.frames).toHaveLength(6)
    expect([...t.frames[3].cels[1]]).toEqual([...s.frames[3].cels[1]])
    expect(() => deserialize('{"v":2}')).toThrow()
  })
  it('scales and tints', () => {
    const px = Uint8ClampedArray.of(1, 2, 3, 255, 0, 0, 0, 0)
    const sc = scaleRgba(px, 2, 1, 2)
    expect(sc).toHaveLength(2 * 2 * 2 * 4)
    expect([...sc.slice(4, 8)]).toEqual([1, 2, 3, 255])
    expect([...tintRgba(px, [255, 0, 0], 0.5).slice(0, 4)]).toEqual([255, 0, 0, 128])
  })
})

describe('sprite sheet', () => {
  it('lays out cells with padding', () => {
    const l = layoutSheet(5, 3, 16, 16, 2)
    expect(l.cols).toBe(3)
    expect(l.rows).toBe(2)
    expect(l.width).toBe(2 + 3 * 18)
    expect(l.height).toBe(2 + 2 * 18)
    expect(l.cells[4]).toEqual({ x: 2 + 18, y: 2 + 18 })
  })
  it('builds the sheet and json', () => {
    const s = demoSprite()
    const { rgba, layout } = buildSheet(s, 3, 0)
    expect(rgba.length).toBe(layout.width * layout.height * 4)
    expect(layout.width).toBe(48)
    const j = JSON.parse(sheetJson(s, layout, 'a.png', 2))
    expect(j.frames[4].frame).toEqual({ x: 32, y: 32, w: 32, h: 32 })
    expect(j.meta.size).toEqual({ w: 96, h: 64 })
  })
})

/** Reference GIF LZW decoder used to verify the encoder. */
function lzwDecode(data: number[], minCode: number, count: number): number[] {
  const clear = 1 << minCode, eoi = clear + 1
  let size = minCode + 1, next = eoi + 1
  let table: number[][] = []
  const reset = () => { table = []; for (let i = 0; i < clear; i++) table[i] = [i]; table[clear] = []; table[eoi] = []; size = minCode + 1; next = eoi + 1 }
  reset()
  const out: number[] = []
  let pos = 0, prev: number[] | null = null
  const read = () => { let v = 0; for (let i = 0; i < size; i++, pos++) v |= ((data[pos >> 3] >> (pos & 7)) & 1) << i; return v }
  while (out.length < count) {
    const code = read()
    if (code === clear) { reset(); prev = null; continue }
    if (code === eoi) break
    let entry: number[]
    if (code < next && table[code]) entry = table[code]
    else entry = [...prev!, prev![0]]
    out.push(...entry)
    if (prev) { table[next++] = [...prev, entry[0]]; if (next === 1 << size && size < 12) size++ }
    prev = entry
  }
  return out
}

describe('gif', () => {
  it('LZW round-trips random and repetitive data (incl. table reset)', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8
    for (const data of [Uint8Array.from({ length: 20000 }, () => rnd() & 15), new Uint8Array(5000).fill(3), Uint8Array.from({ length: 300 }, (_, i) => i % 4)]) {
      const enc = lzwEncode(data, 4)
      expect(lzwDecode(enc, 4, data.length)).toEqual([...data])
    }
  })
  it('quantizes with a transparent index', () => {
    const f = { rgba: Uint8ClampedArray.of(255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255), delayMs: 100 }
    const q = quantize([f])
    expect(q.transparent).toBe(0)
    expect(q.palette).toHaveLength(3)
    expect(q.indexed[0][1]).toBe(0)
  })
  it('writes a well-formed file', () => {
    const s = demoSprite()
    const frames = s.frames.map((_, i) => ({ rgba: composeFrame(s, i), delayMs: s.frames[i].duration }))
    const g = encodeGif(frames, 16, 16)
    expect(String.fromCharCode(...g.slice(0, 6))).toBe('GIF89a')
    expect(g[6] | (g[7] << 8)).toBe(16)
    expect(g[g.length - 1]).toBe(0x3b)
    expect(g.length).toBeGreaterThan(100)
  })
})
