import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-tiptap': [
              '@tiptap/starter-kit',
              '@tiptap/vue-3',
              '@tiptap/extension-image',
              '@tiptap/extension-link',
              '@tiptap/extension-placeholder',
              '@tiptap/extension-youtube',
            ],
            'vendor-icons': ['lucide-vue-next'],
            'vendor-echarts': ['echarts'],
          },
        },
      },
    },
    server: {
      host: env.VITE_DEV_HOST || 'localhost',
      port: Number(env.VITE_DEV_PORT) || 5173,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
