const cache = new Map<string, HTMLImageElement>()
let onLoad: () => void = () => {}

/** Called when a not-yet-decoded image finishes loading so the board can redraw. */
export function setImageLoadListener(fn: () => void): void {
  onLoad = fn
}

export function getImage(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.onload = () => onLoad()
    img.src = src
    cache.set(src, img)
  }
  return img
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = getImage(src)
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(img)
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener('error', () => reject(new Error('Image failed to load')), { once: true })
  })
}

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
