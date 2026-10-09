import { pack } from './color'

export type Cel = Uint32Array
export interface Layer { name: string; visible: boolean; opacity: number }
export interface Frame { duration: number; cels: Cel[] }
export interface Sprite { w: number; h: number; layers: Layer[]; frames: Frame[] }

export const MAX_SIZE = 256

export function newSprite(w: number, h: number): Sprite {
  return { w, h, layers: [{ name: 'Layer 1', visible: true, opacity: 1 }], frames: [{ duration: 100, cels: [new Uint32Array(w * h)] }] }
}

export function setCel(s: Sprite, f: number, l: number, cel: Cel): Sprite {
  return { ...s, frames: s.frames.map((fr, i) => (i === f ? { ...fr, cels: fr.cels.map((c, j) => (j === l ? cel : c)) } : fr)) }
}

export function addLayer(s: Sprite, at: number): Sprite {
  const layers = [...s.layers]
  layers.splice(at + 1, 0, { name: `Layer ${s.layers.length + 1}`, visible: true, opacity: 1 })
  return { ...s, layers, frames: s.frames.map((fr) => { const cels = [...fr.cels]; cels.splice(at + 1, 0, new Uint32Array(s.w * s.h)); return { ...fr, cels } }) }
}
export function removeLayer(s: Sprite, l: number): Sprite {
  if (s.layers.length <= 1) return s
  return { ...s, layers: s.layers.filter((_, i) => i !== l), frames: s.frames.map((fr) => ({ ...fr, cels: fr.cels.filter((_, i) => i !== l) })) }
}
export function moveLayer(s: Sprite, l: number, dir: -1 | 1): Sprite {
  const j = l + dir
  if (j < 0 || j >= s.layers.length) return s
  const swap = <V,>(a: V[]) => { const b = [...a]; [b[l], b[j]] = [b[j], b[l]]; return b }
  return { ...s, layers: swap(s.layers), frames: s.frames.map((fr) => ({ ...fr, cels: swap(fr.cels) })) }
}
export function updateLayer(s: Sprite, l: number, patch: Partial<Layer>): Sprite {
  return { ...s, layers: s.layers.map((x, i) => (i === l ? { ...x, ...patch } : x)) }
}
/** Inserts a copy of frame f after itself (or a blank frame). */
export function addFrame(s: Sprite, f: number, blank = false): Sprite {
  const src = s.frames[f]
  const nf: Frame = { duration: src.duration, cels: src.cels.map((c) => (blank ? new Uint32Array(s.w * s.h) : c.slice())) }
  const frames = [...s.frames]
  frames.splice(f + 1, 0, nf)
  return { ...s, frames }
}
export function removeFrame(s: Sprite, f: number): Sprite {
  if (s.frames.length <= 1) return s
  return { ...s, frames: s.frames.filter((_, i) => i !== f) }
}
export function moveFrame(s: Sprite, f: number, dir: -1 | 1): Sprite {
  const j = f + dir
  if (j < 0 || j >= s.frames.length) return s
  const frames = [...s.frames];
  [frames[f], frames[j]] = [frames[j], frames[f]]
  return { ...s, frames }
}
export function setDuration(s: Sprite, f: number, ms: number): Sprite {
  return { ...s, frames: s.frames.map((fr, i) => (i === f ? { ...fr, duration: Math.max(10, Math.min(10000, Math.round(ms))) } : fr)) }
}

/** Alpha-composites the visible layers of a frame into RGBA bytes (straight alpha). */
export function composeFrame(s: Sprite, f: number): Uint8ClampedArray {
  const n = s.w * s.h
  const out = new Uint8ClampedArray(n * 4)
  const fr = s.frames[f]
  for (let l = 0; l < s.layers.length; l++) {
    const ly = s.layers[l]
    if (!ly.visible || ly.opacity <= 0) continue
    const cel = fr.cels[l]
    for (let i = 0; i < n; i++) {
      const c = cel[i]
      const sa0 = c >>> 24
      if (sa0 === 0) continue
      const o = i * 4
      const sa = (sa0 / 255) * ly.opacity
      const da = out[o + 3] / 255
      if (sa >= 0.999 || da === 0) {
        out[o] = c & 255; out[o + 1] = (c >>> 8) & 255; out[o + 2] = (c >>> 16) & 255; out[o + 3] = Math.round(sa * 255)
        continue
      }
      const oa = sa + da * (1 - sa)
      const mix = (s2: number, d: number) => Math.round((s2 * sa + d * da * (1 - sa)) / oa)
      out[o] = mix(c & 255, out[o]); out[o + 1] = mix((c >>> 8) & 255, out[o + 1]); out[o + 2] = mix((c >>> 16) & 255, out[o + 2])
      out[o + 3] = Math.round(oa * 255)
    }
  }
  return out
}

/** Recolours opaque pixels to a single tint with reduced alpha (onion skin). */
export function tintRgba(src: Uint8ClampedArray, rgb: [number, number, number], alpha: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] === 0) continue
    out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = Math.round(src[i + 3] * alpha)
  }
  return out
}

export function scaleRgba(src: Uint8ClampedArray | Uint8Array, w: number, h: number, k: number): Uint8ClampedArray {
  if (k === 1) return new Uint8ClampedArray(src)
  const W = w * k
  const out = new Uint8ClampedArray(W * h * k * 4)
  for (let y = 0; y < h * k; y++) {
    const sy = Math.floor(y / k)
    for (let x = 0; x < W; x++) {
      const si = (sy * w + Math.floor(x / k)) * 4
      const di = (y * W + x) * 4
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]
    }
  }
  return out
}

export function rgbaToCel(rgba: Uint8ClampedArray | Uint8Array, n: number): Cel {
  const cel = new Uint32Array(n)
  for (let i = 0; i < n; i++) cel[i] = rgba[i * 4 + 3] === 0 ? 0 : pack(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3])
  return cel
}

/** JSON-friendly project (cels as base64 of RGBA bytes). */
export function serialize(s: Sprite): string {
  const b64 = (c: Cel) => {
    const u8 = new Uint8Array(c.buffer, c.byteOffset, c.byteLength)
    let bin = ''
    for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192))
    return btoa(bin)
  }
  return JSON.stringify({ v: 1, w: s.w, h: s.h, layers: s.layers, frames: s.frames.map((f) => ({ duration: f.duration, cels: f.cels.map(b64) })) })
}
export function deserialize(json: string): Sprite {
  const o = JSON.parse(json)
  if (!o || o.v !== 1 || !Number.isInteger(o.w) || !Number.isInteger(o.h) || o.w < 1 || o.h < 1 || o.w > MAX_SIZE || o.h > MAX_SIZE) throw new Error('Not a valid project file')
  const cel = (b: string) => {
    const bin = atob(b)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    if (u8.length !== o.w * o.h * 4) throw new Error('Corrupt cel')
    return new Uint32Array(u8.buffer)
  }
  const layers = o.layers as Layer[]
  const frames = (o.frames as { duration: number; cels: string[] }[]).map((f) => ({ duration: f.duration, cels: f.cels.map(cel) }))
  if (!layers.length || !frames.length || frames.some((f) => f.cels.length !== layers.length)) throw new Error('Corrupt project')
  return { w: o.w, h: o.h, layers, frames }
}
