import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMediaRefresh, rememberMediaAccess, mediaExpiresAt } from '../mediaAccess'

let dispose: (() => void) | undefined
const oldUrl = (name: string) => `https://test.oss-cn-hangzhou.aliyuncs.com/media/${name}?x-oss-date=20261011T000000Z&x-oss-expires=3600&x-oss-signature=old`
const freshUrl = (name: string) => `https://test.oss-cn-hangzhou.aliyuncs.com/media/${name}?Expires=1999999999&Signature=new`

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T02:00:00Z')) })
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('private media refresh', () => {
  it('parses V4 expiry', () => {
    expect(mediaExpiresAt(oldUrl('date.webp'))).toBe(Date.parse('2026-10-11T01:00:00Z'))
  })

  it('renews expired published images with their news context and deduplicates requests', async () => {
    const source = oldUrl('news.webp')
    rememberMediaAccess({ id: 12, imageUrl: source })
    const resolve = vi.fn(async () => ({ url: freshUrl('news.webp') }))
    dispose = installMediaRefresh(resolve)
    const images = [document.createElement('img'), document.createElement('img')]
    images.forEach(image => { image.src = source; document.body.append(image) })
    await vi.advanceTimersByTimeAsync(30000)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ url: source.split('?')[0], newsId: 12 })
    images.forEach(image => expect(image.getAttribute('src')).toBe(freshUrl('news.webp')))
  })

  it('renews draft media after a loading error using the draft context', async () => {
    const source = oldUrl('draft.webp')
    rememberMediaAccess({ id: 'draft-test', content: [{ type: 'image', src: source }] })
    const resolve = vi.fn(async () => ({ url: freshUrl('draft.webp') }))
    dispose = installMediaRefresh(resolve)
    const image = document.createElement('img')
    image.src = source
    document.body.append(image)
    image.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(0)
    expect(resolve).toHaveBeenCalledWith({ url: source.split('?')[0], draftId: 'draft-test' })
    expect(image.getAttribute('src')).toBe(freshUrl('draft.webp'))
  })

  it('renews video and poster while preserving playback position', async () => {
    const source = oldUrl('video.mp4')
    const poster = oldUrl('poster.webp')
    rememberMediaAccess({ id: 15, content: [{ src: source, poster }] })
    const resolve = vi.fn(async ({ url }: { url: string }) => ({ url: freshUrl(url.includes('video.mp4') ? 'video.mp4' : 'poster.webp') }))
    dispose = installMediaRefresh(resolve)
    const video = document.createElement('video')
    vi.spyOn(video, 'load').mockImplementation(() => {})
    video.src = source
    video.setAttribute('poster', poster)
    video.currentTime = 25
    document.body.append(video)
    await vi.advanceTimersByTimeAsync(30000)
    expect(video.getAttribute('src')).toBe(freshUrl('video.mp4'))
    expect(video.getAttribute('poster')).toBe(freshUrl('poster.webp'))
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBe(25)
  })

  it('does not renew unrelated or unexpired URLs and backs off after a failure', async () => {
    const source = oldUrl('failure.webp')
    rememberMediaAccess({ url: source })
    const resolve = vi.fn(async () => { throw new Error('forbidden') })
    dispose = installMediaRefresh(resolve)
    for (const src of ['https://example.com/external.webp', freshUrl('unknown.webp'), source]) {
      const image = document.createElement('img'); image.src = src; document.body.append(image)
      image.dispatchEvent(new Event('error'))
      image.dispatchEvent(new Event('error'))
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ url: source.split('?')[0] })
  })
})
