/** RGBA bytes → a canvas of the same size. */
export function toCanvas(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return c
}
export function drawScaled(ctx: CanvasRenderingContext2D, rgba: Uint8ClampedArray, w: number, h: number, zoom: number): void {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(toCanvas(rgba, w, h), 0, 0, w * zoom, h * zoom)
}
