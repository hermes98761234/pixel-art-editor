export interface GifFrame { rgba: Uint8ClampedArray | Uint8Array; delayMs: number }

/** Builds a palette (index 0 reserved for transparency when needed) and maps every frame to indices. */
export function quantize(frames: GifFrame[]): { palette: number[]; indexed: Uint8Array[]; transparent: number } {
  const counts = new Map<number, number>()
  let hasAlpha = false
  for (const f of frames) for (let i = 0; i < f.rgba.length; i += 4) {
    if (f.rgba[i + 3] < 128) { hasAlpha = true; continue }
    const k = (f.rgba[i] << 16) | (f.rgba[i + 1] << 8) | f.rgba[i + 2]
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const maxColors = hasAlpha ? 255 : 256
  let colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])
  if (colors.length > maxColors) colors = colors.slice(0, maxColors)
  const palette = hasAlpha ? [0, ...colors] : colors
  if (palette.length === 0) palette.push(0)
  const first = hasAlpha ? 1 : 0
  const lookup = new Map<number, number>()
  palette.forEach((c, i) => { if (i >= first) lookup.set(c, i) })
  const nearest = (r: number, g: number, b: number) => {
    let best = first, bd = Infinity
    for (let i = first; i < palette.length; i++) {
      const c = palette[i]
      const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  const indexed = frames.map((f) => {
    const out = new Uint8Array(f.rgba.length / 4)
    for (let i = 0; i < out.length; i++) {
      if (f.rgba[i * 4 + 3] < 128) { out[i] = 0; continue }
      const r = f.rgba[i * 4], g = f.rgba[i * 4 + 1], b = f.rgba[i * 4 + 2]
      const k = (r << 16) | (g << 8) | b
      let idx = lookup.get(k)
      if (idx === undefined) { idx = nearest(r, g, b); lookup.set(k, idx) }
      out[i] = idx
    }
    return out
  })
  return { palette, indexed, transparent: hasAlpha ? 0 : -1 }
}

export function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize, eoi = clear + 1
  const out: number[] = []
  let cur = 0, nbits = 0
  const emit = (code: number, size: number) => {
    cur |= code << nbits
    nbits += size
    while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8 }
  }
  let size = minCodeSize + 1
  let dict = new Map<number, number>()
  let next = eoi + 1
  emit(clear, size)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const hit = dict.get(key)
    if (hit !== undefined) { prefix = hit; continue }
    emit(prefix, size)
    if (next < 4096) {
      dict.set(key, next++)
      if (next - 1 === (1 << size) && size < 12) size++
    } else {
      emit(clear, size)
      dict = new Map()
      next = eoi + 1
      size = minCodeSize + 1
    }
    prefix = k
  }
  emit(prefix, size)
  emit(eoi, size)
  if (nbits > 0) out.push(cur & 255)
  return out
}

export function encodeGif(frames: GifFrame[], w: number, h: number, loop = true): Uint8Array {
  const { palette, indexed, transparent } = quantize(frames)
  let bits = 1
  while (1 << bits < palette.length) bits++
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255)
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)))
  u16(w); u16(h)
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0)
  for (let i = 0; i < 1 << bits; i++) { const c = palette[i] ?? 0; out.push((c >> 16) & 255, (c >> 8) & 255, c & 255) }
  if (loop) out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0)
  const minCode = Math.max(2, bits)
  frames.forEach((f, fi) => {
    out.push(0x21, 0xf9, 4, (transparent >= 0 ? 0x09 : 0x04) | 0, 0, 0, 0, 0)
    const d = Math.max(2, Math.round(f.delayMs / 10))
    out[out.length - 4] = d & 255; out[out.length - 3] = (d >> 8) & 255
    out[out.length - 2] = transparent >= 0 ? transparent : 0
    out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0)
    out.push(minCode)
    const data = lzwEncode(indexed[fi], minCode)
    for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); out.push(chunk.length, ...chunk) }
    out.push(0)
  })
  out.push(0x3b)
  return Uint8Array.from(out)
}
