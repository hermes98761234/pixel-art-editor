/** Pixels are packed little-endian as 0xAABBGGRR so a Uint32Array shares a buffer with RGBA bytes. */
export function pack(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}
export function unpack(c: number): [number, number, number, number] {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24]
}
export function parseHex(s: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return pack(n(0), n(2), n(4), h.length === 8 ? n(6) : 255)
}
export function toHex(c: number): string {
  const [r, g, b] = unpack(c)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}
