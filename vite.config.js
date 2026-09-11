import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
const model1Proxy = {
  '/satquery-model1': {
    target: 'https://satquery-model1-vqa-api.onrender.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/satquery-model1/, ''),
    timeout: 120000,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: model1Proxy },
  preview: { proxy: model1Proxy },
})
