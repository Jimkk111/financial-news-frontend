// 私有媒体仅通过后端授权接口续签，稳定标识不包含签名参数。
type Context = { newsId?: number; draftId?: string }
type Entry = { url: string; context: Context }
const entries = new Map<string, Entry>()
const fields = new Set(['src', 'poster', 'coverImage', 'imageUrl', 'url'])

export function mediaIdentity(source: string): string | null {
  try {
    const url = new URL(source)
    if (!url.searchParams.has('x-oss-signature') && !url.searchParams.has('Signature')) return null
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch { return null }
}

export function mediaExpiresAt(source: string): number {
  try {
    const url = new URL(source)
    const expires = url.searchParams.get('Expires')
    if (expires) return Number(expires) * 1000
    const date = url.searchParams.get('x-oss-date')
    const seconds = Number(url.searchParams.get('x-oss-expires'))
    if (!date || !/^\d{8}T\d{6}Z$/.test(date) || !seconds) return 0
    const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${date.slice(9,11)}:${date.slice(11,13)}:${date.slice(13,15)}Z`
    return Date.parse(iso) + seconds * 1000
  } catch { return 0 }
}

export function rememberMediaAccess(value: unknown, inherited: Context = {}): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach(item => rememberMediaAccess(item, inherited)); return }
  const object = value as Record<string, unknown>
  let context = inherited
  if (typeof object.newsId === 'number') context = { newsId: object.newsId }
  else if (typeof object.id === 'number') context = { newsId: object.id }
  else if (typeof object.id === 'string' && object.id.startsWith('draft-')) context = { draftId: object.id }
  for (const [name, child] of Object.entries(object)) {
    if (fields.has(name) && typeof child === 'string') {
      const key = mediaIdentity(child)
      if (key) {
        entries.delete(key)
        entries.set(key, { url: child, context })
        if (entries.size > 2000) entries.delete(entries.keys().next().value!)
      }
    } else rememberMediaAccess(child, context)
  }
}

export function installMediaRefresh(resolve: (params: Context & { url: string }) => Promise<{ url: string }>): () => void {
  const pending = new Map<string, Promise<string>>()
  const attemptedAt = new Map<string, number>()
  async function renew(element: HTMLImageElement | HTMLVideoElement, attribute: 'src' | 'poster') {
    const source = element.getAttribute(attribute)
    if (!source) return
    const key = mediaIdentity(source)
    if (!key) return
    const entry = entries.get(key)
    if (!entry || mediaExpiresAt(source) > Date.now() + 60000) return
    let url = entry.url
    if (mediaExpiresAt(url) <= Date.now() + 60000) {
      let task = pending.get(key)
      if (!task) {
        if (Date.now() - (attemptedAt.get(key) ?? 0) < 30000) return
        attemptedAt.set(key, Date.now())
        task = resolve({ url: key, ...entry.context }).then(result => {
          entries.set(key, { url: result.url, context: entry.context })
          return result.url
        }).finally(() => pending.delete(key))
        pending.set(key, task)
      }
      url = await task
    }
    if (!element.isConnected || element.getAttribute(attribute) !== source || url === source) return
    if (element instanceof HTMLVideoElement && attribute === 'src') {
      const time = element.currentTime
      const paused = element.paused
      element.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(time)) element.currentTime = time
        if (!paused) void element.play().catch(() => {})
      }, { once: true })
      element.setAttribute(attribute, url)
      element.load()
    } else element.setAttribute(attribute, url)
  }
  const refresh = (element: HTMLImageElement | HTMLVideoElement) => {
    void renew(element, 'src').catch(() => {})
    if (element instanceof HTMLVideoElement) void renew(element, 'poster').catch(() => {})
  }
  const scan = () => {
    document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img[src], video[src], video[poster]').forEach(refresh)
  }
  const onError = (event: Event) => {
    if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) refresh(event.target)
  }
  document.addEventListener('error', onError, true)
  document.addEventListener('visibilitychange', scan)
  window.addEventListener('focus', scan)
  const interval = window.setInterval(scan, 30000)
  return () => {
    window.clearInterval(interval)
    document.removeEventListener('error', onError, true)
    document.removeEventListener('visibilitychange', scan)
    window.removeEventListener('focus', scan)
  }
}
