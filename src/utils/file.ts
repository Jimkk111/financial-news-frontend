// ============================================================
// 上传文件校验
// 类型白名单与大小上限按后端约束收敛在此，供各上传入口复用
// ============================================================

export interface FileUploadRule {
  /** 允许的 MIME 类型 */
  allowedTypes: string[]
  /** 大小上限（MB） */
  maxSizeMB: number
  /** 文件类别中文名，用于错误文案，如「图片」「视频」 */
  kindLabel: string
  /** 允许的类型中文名，用于错误文案 */
  typeLabel: string
}

export const IMAGE_UPLOAD_RULE: FileUploadRule = {
  allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  maxSizeMB: 5,
  kindLabel: '图片',
  typeLabel: 'PNG、JPEG、GIF、WebP',
}

export const VIDEO_UPLOAD_RULE: FileUploadRule = {
  allowedTypes: ['video/mp4', 'video/webm', 'video/ogg'],
  maxSizeMB: 100,
  kindLabel: '视频',
  typeLabel: 'MP4、WebM、OGG',
}

/** 校验文件类型与大小：通过返回 null，否则返回可直接展示的错误文案 */
export function validateUploadFile(file: File, rule: FileUploadRule): string | null {
  if (!rule.allowedTypes.includes(file.type)) {
    return `请选择有效的${rule.kindLabel}文件（${rule.typeLabel}）`
  }
  if (file.size > rule.maxSizeMB * 1024 * 1024) {
    return `${rule.kindLabel}大小不能超过 ${rule.maxSizeMB}MB`
  }
  return null
}
