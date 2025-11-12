import { defineConfig, type ResolvedConfig } from 'vite'
import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

function spa404Fallback() {
  let outDir = 'dist'
  return {
    name: 'spa-404-fallback',
    apply: 'build' as const,
    configResolved(config: ResolvedConfig) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      const indexPath = resolve(outDir, 'index.html')
      const fallbackPath = resolve(outDir, '404.html')
      try {
        await copyFile(indexPath, fallbackPath)
      } catch (error) {
        console.warn('[spa-404-fallback] Unable to create 404.html fallback:', error)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spa404Fallback()],
  define: {
    __BUILD_ID__: JSON.stringify(String(Date.now())),
  },
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    fs: {
      allow: ['.'],
    },
  },
})
