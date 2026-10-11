import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // htmlToBlocks 依赖浏览器 DOMParser，统一跑在 happy-dom 环境
    // （DOMPurify 相关断言例外，见 markdown.spec.ts 的 jsdom 环境声明）
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      // 仓库内的旧依赖备份目录，其中含第三方测试文件，不应被扫描执行
      '**/node_modules_pnpm_bak/**',
      '**/node_modules_broken/**',
    ],
  },
})
