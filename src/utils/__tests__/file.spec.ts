import { describe, expect, it } from 'vitest'
import { IMAGE_UPLOAD_RULE, VIDEO_UPLOAD_RULE, validateUploadFile } from '../file'

describe('validateUploadFile', () => {
  it('图片：类型在白名单内且未超限返回 null', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 1024 })
    expect(validateUploadFile(file, IMAGE_UPLOAD_RULE)).toBeNull()
  })

  it('图片：类型不在白名单内返回类型错误文案', () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    expect(validateUploadFile(file, IMAGE_UPLOAD_RULE)).toBe(
      '请选择有效的图片文件（PNG、JPEG、GIF、WebP）',
    )
  })

  it('图片：超过 5MB 返回大小错误文案', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 })
    expect(validateUploadFile(file, IMAGE_UPLOAD_RULE)).toBe('图片大小不能超过 5MB')
  })

  it('视频：类型不在白名单内返回类型错误文案', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    expect(validateUploadFile(file, VIDEO_UPLOAD_RULE)).toBe(
      '请选择有效的视频文件（MP4、WebM、OGG）',
    )
  })

  it('视频：超过 100MB 返回大小错误文案', () => {
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 })
    expect(validateUploadFile(file, VIDEO_UPLOAD_RULE)).toBe('视频大小不能超过 100MB')
  })
})
