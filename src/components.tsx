import { useEffect, useRef, useState } from 'react'
import { composeFrame, scaleRgba, type Sprite } from './lib/sprite'
import { drawScaled } from './lib/canvas'

export function Thumb({ sprite, f, size = 48 }: { sprite: Sprite; f: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const k = Math.max(1, Math.floor(size / Math.max(sprite.w, sprite.h)))
  useEffect(() => {
    const c = ref.current!
    c.width = sprite.w * k
    c.height = sprite.h * k
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    drawScaled(ctx, composeFrame(sprite, f), sprite.w, sprite.h, k)
  }, [sprite, f, k])
  return <canvas ref={ref} className="checker thumb" />
}

export function Preview({ sprite, scale, t }: { sprite: Sprite; scale: number; t: (s: string) => string }) {
  const [playing, setPlaying] = useState(true)
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLCanvasElement>(null)
  const n = sprite.frames.length
  const cur = Math.min(idx, n - 1)
  useEffect(() => {
    if (!playing || n < 2) return
    const id = setTimeout(() => setIdx((cur + 1) % n), sprite.frames[cur].duration)
    return () => clearTimeout(id)
  }, [playing, cur, n, sprite])
  useEffect(() => {
    const c = ref.current!
    c.width = sprite.w * scale
    c.height = sprite.h * scale
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.imageSmoothingEnabled = false
    drawScaled(ctx, scaleRgba(composeFrame(sprite, cur), sprite.w, sprite.h, 1), sprite.w, sprite.h, scale)
  }, [sprite, cur, scale])
  return (
    <div>
      <div className="preview-wrap"><canvas ref={ref} className="checker" /></div>
      <div className="row">
        <button onClick={() => setPlaying(!playing)}>{playing ? t('Pause') : t('Play')}</button>
        <span className="hint">{cur + 1} / {n}</span>
      </div>
    </div>
  )
}
