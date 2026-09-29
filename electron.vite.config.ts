import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve('src/main/main.ts'), output: { entryFileNames: 'main.js' } } }
  },
  preload: {
    build: { rollupOptions: { input: resolve('src/preload/preload.ts'), output: { entryFileNames: 'preload.js', format: 'cjs' } } }
  },
  renderer: {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
