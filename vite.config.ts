import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(String(Date.now())),
  },
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    historyApiFallback: true,
  },
})