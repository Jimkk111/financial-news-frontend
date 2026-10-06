export interface UserInfo {
  id: number
  uid: string
  displayId?: string
  username: string
  email: string
  avatar: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  code: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  // JWT 已改用 HttpOnly Cookie 传输，前端不再读取/存储该字段，仅保留以对齐后端契约
  accessToken: string
  user: UserInfo
}

export interface ResetPasswordRequest {
  username: string
  email: string
  code: string
  password: string
}

export interface MessageResponse {
  message: string
}
