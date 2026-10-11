import { createApp } from 'vue'
import request from '@/api/request'
import { installMediaRefresh } from '@/utils/mediaAccess'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/index.scss'
import { useThemeStore } from './stores/theme'
import { toast, errorMessage } from './utils/toast'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 初始化主题 (必须在 pinia 创建之后，app.mount 之前)
const themeStore = useThemeStore()
themeStore.init()

// ---------- 全局异常兜底 ----------
// 组件内未捕获的异常：提示用户 + 保留控制台堆栈，避免整页白屏/假死
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[global] ${info}:`, err)
  toast.error(errorMessage(err, '页面出现异常，请稍后重试'))
}

// 未被 catch 的 Promise 拒绝（如 void 调用的异步操作）
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason
  // 主动取消的请求（AbortController）不算异常
  if (err instanceof DOMException && err.name === 'AbortError') return
  console.error('[unhandledrejection]:', err)
  toast.error(errorMessage(err, '请求出现异常，请稍后重试'))
})

installMediaRefresh(params => request.get('/media/access', { params }) as unknown as Promise<{ url: string }>)

app.mount('#app')
