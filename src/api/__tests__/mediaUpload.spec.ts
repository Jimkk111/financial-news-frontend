import { afterEach, describe, expect, it, vi } from 'vitest'
import request from '../request'
import { uploadImage, uploadVideo } from '../draft'
import { IMAGE_UPLOAD_RULE, VIDEO_UPLOAD_RULE, validateUploadFile } from '@/utils/file'
import { getApiErrorMessage } from '@/utils/apiError'
import { AxiosError } from 'axios'

const originalAdapter = request.defaults.adapter
afterEach(() => { request.defaults.adapter = originalAdapter })

describe('media uploads', () => {
  it.each([
    ['image', uploadImage, 300000],
    ['video', uploadVideo, 600000],
  ] as const)('uses the backend %s multipart contract', async (kind, upload, timeout) => {
    const adapter = vi.fn(async (config) => ({
      data: { code: '200', data: { url: 'https://cdn.example.com/test' } },
      status: 200, statusText: 'OK', headers: {}, config,
    }))
    request.defaults.adapter = adapter
    const file = new File(['test'], 'test', { type: kind === 'image' ? 'image/png' : 'video/mp4' })
    expect(await upload(file)).toEqual({ url: 'https://cdn.example.com/test' })
    const config = adapter.mock.calls[0]![0]
    expect(config).toMatchObject({ method: 'post', url: `/media/${kind}`, timeout, withCredentials: true })
    expect(config.data).toBeInstanceOf(FormData)
    expect(config.data.get('file')).toBe(file)
    expect(Array.from(config.data.keys())).toEqual(['file'])
  })

  it('aligns limits and rejects unsupported OGG', () => {
    expect(IMAGE_UPLOAD_RULE.maxSizeMB).toBe(10)
    expect(VIDEO_UPLOAD_RULE.maxSizeMB).toBe(200)
    expect(validateUploadFile(new File(['test'], 'test.ogg', { type: 'video/ogg' }), VIDEO_UPLOAD_RULE)).toBeTruthy()
    expect(validateUploadFile(new File(['test'], 'test.webp', { type: 'image/webp' }), IMAGE_UPLOAD_RULE)).toBeNull()
  })

  it('shows the backend storage error from an HTTP failure', () => {
    const error = new AxiosError('Request failed')
    error.response = { status: 503, statusText: 'Unavailable', data: { code: 'MEDIA_NOT_CONFIGURED', msg: '对象存储未配置' }, headers: {}, config: {} as never }
    expect(getApiErrorMessage(error, '上传失败')).toBe('对象存储未配置')
  })
})
