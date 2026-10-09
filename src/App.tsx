import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Footer, Toolbar, usePersisted, useShell } from './common'
import Editor, { type Tool } from './Editor'
import { Preview, Thumb } from './components'
import { canvasToBlob, download } from './lib/download'
import { toCanvas } from './lib/canvas'
import { parseHex, toHex } from './lib/color'
import { PALETTES } from './lib/palettes'
import { copyRegion, clearRegion, pasteRegion, type Rect } from './lib/draw'
import { encodeGif } from './lib/gif'
import { buildSheet, sheetJson } from './lib/sheet'
import { demoSprite } from './lib/demo'
import {
  MAX_SIZE, addFrame, addLayer, composeFrame, deserialize, moveFrame, moveLayer, newSprite, removeFrame, removeLayer, rgbaToCel,
  scaleRgba, serialize, setCel, setDuration, updateLayer, type Sprite,
} from './lib/sprite'

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'pencil', label: 'Pencil', key: 'B', icon: '✏️' },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: '🧽' },
  { id: 'fill', label: 'Fill', key: 'G', icon: '🪣' },
  { id: 'line', label: 'Line', key: 'L', icon: '╱' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'rectf', label: 'Filled rectangle', key: 'Shift+R', icon: '■' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: '◯' },
  { id: 'ellipsef', label: 'Filled ellipse', key: 'Shift+O', icon: '●' },
  { id: 'select', label: 'Select', key: 'M', icon: '⬚' },
  { id: 'picker', label: 'Picker', key: 'I', icon: '💧' },
]

interface Hist { past: Sprite[]; cur: Sprite; future: Sprite[] }
const KEY = 'pixel-art-editor:project'

function initial(): Sprite {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return deserialize(raw)
  } catch { /* fall through */ }
  return demoSprite()
}

export default function App() {
  const shell = useShell()
  const { t } = shell
  const [hist, setHist] = useState<Hist>(() => ({ past: [], cur: initial(), future: [] }))
  const [live, setLive] = useState<Sprite | null>(null)
  const sprite = live ?? hist.cur
  const [fi, setF] = useState(0)
  const [li, setL] = useState(1)
  const f = Math.min(fi, sprite.frames.length - 1)
  const l = Math.min(li, sprite.layers.length - 1)
  const [tool, setTool] = useState<Tool>('pencil')
  const [ui, setUi] = usePersisted('ui', { color: '#5ac85a', brush: 1, mirror: false, grid: true, onion: true, zoom: 0, paletteIdx: 1, extra: [] as string[], sheetPad: 0, scale: 4, loop: true })
  const [sel, setSel] = useState<Rect | null>(null)
  const clip = useRef<{ buf: Uint32Array; w: number; h: number } | null>(null)
  const [newSize, setNewSize] = useState({ w: 32, h: 32 })
  const [msg, setMsg] = useState('')
  const color = parseHex(ui.color) ?? 0xff000000

  const commit = useCallback((next: Sprite) => {
    setHist((h) => ({ past: [...h.past.slice(-99), h.cur], cur: next, future: [] }))
    setLive(null)
  }, [])
  const undo = useCallback(() => { setLive(null); setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), cur: h.past[h.past.length - 1], future: [h.cur, ...h.future] } : h)) }, [])
  const redo = useCallback(() => { setLive(null); setHist((h) => (h.future.length ? { past: [...h.past, h.cur], cur: h.future[0], future: h.future.slice(1) } : h)) }, [])
  const reset = (s: Sprite) => { setHist({ past: [], cur: s, future: [] }); setLive(null); setF(0); setL(s.layers.length - 1); setSel(null) }

  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem(KEY, serialize(hist.cur)) } catch { /* quota */ } }, 400)
    return () => clearTimeout(id)
  }, [hist.cur])

  const zoom = ui.zoom || Math.max(1, Math.min(40, Math.floor(560 / Math.max(sprite.w, sprite.h))))
  const cel = () => sprite.frames[f].cels[l]

  const copy = (cut: boolean) => {
    if (!sel) return
    clip.current = { buf: copyRegion(cel(), sprite.w, sel), w: sel.w, h: sel.h }
    if (cut) { const c = cel().slice(); clearRegion(c, sprite.w, sel); commit(setCel(sprite, f, l, c)) }
  }
  const paste = () => {
    const c = clip.current
    if (!c) return
    const x = sel?.x ?? 0, y = sel?.y ?? 0
    const nc = cel().slice()
    pasteRegion(nc, sprite.w, sprite.h, c.buf, c.w, c.h, x, y)
    commit(setCel(sprite, f, l, nc))
    setSel({ x, y, w: Math.min(c.w, sprite.w - x), h: Math.min(c.h, sprite.h - y) })
  }
  const del = () => {
    if (!sel) return
    const c = cel().slice(); clearRegion(c, sprite.w, sel); commit(setCel(sprite, f, l, c))
  }

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    const el = e.target as HTMLElement
    if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox') return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
    if (mod && k === 'y') { e.preventDefault(); redo(); return }
    if (mod && k === 'c') { copy(false); return }
    if (mod && k === 'x') { copy(true); return }
    if (mod && k === 'v') { paste(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { del(); return }
    if (e.key === 'Escape') { setSel(null); return }
    if (mod || e.altKey) return
    const map: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', m: 'select', i: 'picker' }
    if (k === 'r') setTool(e.shiftKey ? 'rectf' : 'rect')
    else if (k === 'o') setTool(e.shiftKey ? 'ellipsef' : 'ellipse')
    else if (map[k]) setTool(map[k])
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const palette = PALETTES[ui.paletteIdx] ?? PALETTES[0]
  const swatches = [...palette.colors, ...ui.extra]

  const flip = (h: boolean) => {
    const c = cel(), n = new Uint32Array(c.length)
    for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) n[y * sprite.w + x] = h ? c[y * sprite.w + sprite.w - 1 - x] : c[(sprite.h - 1 - y) * sprite.w + x]
    commit(setCel(sprite, f, l, n))
  }

  const baseName = 'sprite'
  const sheet = useMemo(() => buildSheet(hist.cur, Math.min(hist.cur.frames.length, 8), ui.sheetPad), [hist.cur, ui.sheetPad])
  const [cols, setCols] = useState(0)
  const sheetCols = cols || Math.min(sprite.frames.length, 8)

  const exportPng = async () => {
    const px = scaleRgba(composeFrame(sprite, f), sprite.w, sprite.h, ui.scale)
    download(await canvasToBlob(toCanvas(px, sprite.w * ui.scale, sprite.h * ui.scale)), `${baseName}-${f + 1}.png`)
  }
  const exportSheet = async () => {
    const { rgba, layout } = buildSheet(sprite, sheetCols, ui.sheetPad)
    const px = scaleRgba(rgba, layout.width, layout.height, ui.scale)
    download(await canvasToBlob(toCanvas(px, layout.width * ui.scale, layout.height * ui.scale)), `${baseName}-sheet.png`)
    download(sheetJson(sprite, layout, `${baseName}-sheet.png`, ui.scale), `${baseName}-sheet.json`, 'application/json')
  }
  const exportGif = () => {
    const k = ui.scale
    const frames = sprite.frames.map((fr, i) => ({ rgba: scaleRgba(composeFrame(sprite, i), sprite.w, sprite.h, k), delayMs: fr.duration }))
    download(new Blob([encodeGif(frames, sprite.w * k, sprite.h * k, ui.loop) as BlobPart], { type: 'image/gif' }), `${baseName}.gif`)
  }
  const openFile = async (file: File | undefined) => {
    if (!file) return
    try {
      if (/json$/i.test(file.name) || file.type === 'application/json') reset(deserialize(await file.text()))
      else {
        const bmp = await createImageBitmap(file)
        if (bmp.width > MAX_SIZE || bmp.height > MAX_SIZE) throw new Error(`max ${MAX_SIZE}×${MAX_SIZE}`)
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bmp, 0, 0)
        let s = newSprite(bmp.width, bmp.height)
        s = setCel(s, 0, 0, rgbaToCel(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width * bmp.height))
        reset(s)
      }
      setMsg('')
    } catch (err) { setMsg(t('Could not open file: {0}', (err as Error).message)) }
  }

  const fitSize = (n: number) => Math.max(1, Math.min(MAX_SIZE, Math.round(n) || 1))

  return (
    <div className="app">
      <Toolbar title={t('Pixel Art Editor')} hint={t('Layers, frames, onion skin, sprite sheets and GIF.')} shell={shell}>
        <button onClick={undo} disabled={!hist.past.length} title="Ctrl+Z">↶ {t('Undo')}</button>
        <button onClick={redo} disabled={!hist.future.length} title="Ctrl+Y">↷ {t('Redo')}</button>
      </Toolbar>
      <div className="body">
        <aside className="side"><div className="panel">
          <div className="section">
            <h3>{t('Tools')}</h3>
            <div className="tools">
              {TOOLS.map((x) => (
                <button key={x.id} className={tool === x.id ? 'on' : ''} title={`${t(x.label)} (${x.key})`} aria-label={t(x.label)} aria-pressed={tool === x.id} onClick={() => setTool(x.id)}>{x.icon}</button>
              ))}
            </div>
            <div className="row">
              <label>{t('Brush')}
                <select value={ui.brush} onChange={(e) => setUi({ ...ui, brush: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}px</option>)}</select>
              </label>
              <label className="check"><input type="checkbox" checked={ui.mirror} onChange={(e) => setUi({ ...ui, mirror: e.target.checked })} />{t('Mirror X')}</label>
            </div>
            <div className="row">
              <button className="small" onClick={() => flip(true)}>⇋ {t('Flip horizontally')}</button>
              <button className="small" onClick={() => flip(false)}>⇅ {t('Flip vertically')}</button>
              <button className="small danger" onClick={() => commit(setCel(sprite, f, l, new Uint32Array(sprite.w * sprite.h)))}>{t('Clear layer')}</button>
            </div>
          </div>
          <div className="section">
            <h3>{t('Palette')}</h3>
            <div className="row">
              <input type="color" value={ui.color.length === 7 ? ui.color : '#000000'} onChange={(e) => setUi({ ...ui, color: e.target.value })} aria-label={t('Color')} />
              <input type="text" className="mono hex" value={ui.color} onChange={(e) => setUi({ ...ui, color: e.target.value })} aria-label="hex" />
              <button className="small" title={t('Add colour to palette')} onClick={() => !swatches.includes(toHex(color)) && setUi({ ...ui, extra: [...ui.extra, toHex(color)].slice(-32) })}>＋</button>
              <select value={ui.paletteIdx} onChange={(e) => setUi({ ...ui, paletteIdx: +e.target.value })} aria-label={t('Palette')}>{PALETTES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select>
            </div>
            <div className="swatches">
              {swatches.map((c) => <button key={c} className={'sw' + (c === toHex(color) ? ' on' : '')} style={{ background: c }} title={c} aria-label={c} onClick={() => setUi({ ...ui, color: c })} />)}
            </div>
          </div>
          <div className="section">
            <h3>{t('Layers')}</h3>
            {sprite.layers.map((_, i) => i).reverse().map((i) => {
              const ly = sprite.layers[i]
              return (
                <div key={i} className={'layer' + (i === l ? ' active' : '')} onClick={() => setL(i)}>
                  <input type="checkbox" checked={ly.visible} title={t('Visible')} aria-label={t('Visible')} onClick={(e) => e.stopPropagation()} onChange={(e) => commit(updateLayer(sprite, i, { visible: e.target.checked }))} />
                  <input type="text" value={ly.name} aria-label={t('Name')} onChange={(e) => commit(updateLayer(sprite, i, { name: e.target.value }))} />
                  <input type="range" min={0} max={1} step={0.05} value={ly.opacity} title={t('Opacity')} aria-label={t('Opacity')} onChange={(e) => commit(updateLayer(sprite, i, { opacity: +e.target.value }))} />
                  <button className="small" title={t('Move up')} onClick={(e) => { e.stopPropagation(); commit(moveLayer(sprite, i, 1)); setL(Math.min(sprite.layers.length - 1, i + 1)) }}>↑</button>
                  <button className="small" title={t('Move down')} onClick={(e) => { e.stopPropagation(); commit(moveLayer(sprite, i, -1)); setL(Math.max(0, i - 1)) }}>↓</button>
                  <button className="small danger" title={t('Delete')} onClick={(e) => { e.stopPropagation(); commit(removeLayer(sprite, i)); setL(Math.max(0, i - 1)) }}>✕</button>
                </div>
              )
            })}
            <button className="small" onClick={() => { commit(addLayer(sprite, l)); setL(l + 1) }}>＋ {t('Add layer')}</button>
          </div>
          <div className="section">
            <h3>{t('Preview')}</h3>
            <Preview sprite={hist.cur} scale={Math.max(1, Math.floor(160 / Math.max(sprite.w, sprite.h)))} t={t} />
          </div>
          <div className="section">
            <h3>{t('Export')}</h3>
            <div className="grid2">
              <div className="field"><label>{t('Scale')}</label>
                <select value={ui.scale} onChange={(e) => setUi({ ...ui, scale: +e.target.value })}>{[1, 2, 4, 8, 16].map((n) => <option key={n} value={n}>{n}×</option>)}</select></div>
              <div className="field"><label>{t('Columns')}</label>
                <input type="number" min={1} max={sprite.frames.length} value={sheetCols} onChange={(e) => setCols(Math.max(1, Math.min(sprite.frames.length, +e.target.value || 1)))} /></div>
              <div className="field"><label>{t('Padding')}</label>
                <input type="number" min={0} max={16} value={ui.sheetPad} onChange={(e) => setUi({ ...ui, sheetPad: Math.max(0, Math.min(16, +e.target.value || 0)) })} /></div>
              <label className="check"><input type="checkbox" checked={ui.loop} onChange={(e) => setUi({ ...ui, loop: e.target.checked })} />{t('Loop')}</label>
            </div>
            <div className="row">
              <button className="primary" onClick={exportPng}>{t('PNG (this frame)')}</button>
              <button className="primary" onClick={exportSheet}>{t('Sprite sheet')}</button>
              <button className="primary" onClick={exportGif}>GIF</button>
            </div>
            <p className="hint">{t('Sheet {0}×{1} px, {2} frames', sheet.layout.width * ui.scale, sheet.layout.height * ui.scale, sprite.frames.length)}</p>
            <div className="row">
              <button onClick={() => download(serialize(hist.cur), `${baseName}.pixel.json`, 'application/json')}>{t('Save project')}</button>
              <label className="filebtn">{t('Open project or image')}<input type="file" accept=".json,image/*" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = '' }} /></label>
            </div>
            {msg && <p className="hint err-text">{msg}</p>}
          </div>
          <div className="section">
            <h3>{t('New sprite')}</h3>
            <div className="row">
              <input type="number" className="num" min={1} max={MAX_SIZE} value={newSize.w} onChange={(e) => setNewSize({ ...newSize, w: fitSize(+e.target.value) })} aria-label={t('Width')} />
              ×
              <input type="number" className="num" min={1} max={MAX_SIZE} value={newSize.h} onChange={(e) => setNewSize({ ...newSize, h: fitSize(+e.target.value) })} aria-label={t('Height')} />
              <button onClick={() => window.confirm(t('Discard the current sprite?')) && reset(newSprite(newSize.w, newSize.h))}>{t('Create')}</button>
            </div>
          </div>
        </div></aside>
        <main className="main">
          <div className="box">
            <div className="row">
              <label>{t('Zoom')} <input type="range" min={1} max={40} value={zoom} onChange={(e) => setUi({ ...ui, zoom: +e.target.value })} /> {zoom}×</label>
              <label className="check"><input type="checkbox" checked={ui.grid} onChange={(e) => setUi({ ...ui, grid: e.target.checked })} />{t('Grid')}</label>
              <label className="check"><input type="checkbox" checked={ui.onion} onChange={(e) => setUi({ ...ui, onion: e.target.checked })} />{t('Onion skin')}</label>
              <span className="spacer" />
              <span className="hint mono">{sprite.w}×{sprite.h}</span>
            </div>
            <div className="editor-scroll">
              <Editor sprite={sprite} f={f} l={l} tool={tool} color={color} brush={ui.brush} mirror={ui.mirror} zoom={zoom} grid={ui.grid} onion={ui.onion}
                sel={sel} setSel={setSel} onLive={setLive} onCommit={commit} onPick={(c) => setUi({ ...ui, color: toHex(c) })} />
            </div>
          </div>
          <div className="box">
            <h3>{t('Frames')}</h3>
            <div className="frames">
              {sprite.frames.map((fr, i) => (
                <div key={i} className={'frame' + (i === f ? ' active' : '')} onClick={() => setF(i)}>
                  <Thumb sprite={sprite} f={i} />
                  <span className="hint">{i + 1}</span>
                  <span className="hint">{fr.duration}ms</span>
                </div>
              ))}
            </div>
            <div className="row">
              <button onClick={() => { commit(addFrame(sprite, f)); setF(f + 1) }}>＋ {t('Duplicate frame')}</button>
              <button onClick={() => { commit(addFrame(sprite, f, true)); setF(f + 1) }}>＋ {t('Add frame')}</button>
              <button title="←" onClick={() => { commit(moveFrame(sprite, f, -1)); setF(Math.max(0, f - 1)) }}>←</button>
              <button title="→" onClick={() => { commit(moveFrame(sprite, f, 1)); setF(Math.min(sprite.frames.length - 1, f + 1)) }}>→</button>
              <button className="danger" onClick={() => { commit(removeFrame(sprite, f)); setF(Math.max(0, f - 1)) }}>{t('Delete frame')}</button>
              <label>{t('Duration (ms)')} <input type="number" className="num" min={10} max={10000} step={10} value={sprite.frames[f].duration} onChange={(e) => commit(setDuration(sprite, f, +e.target.value || 100))} /></label>
            </div>
          </div>
        </main>
      </div>
      <Footer t={t} />
    </div>
  )
}
