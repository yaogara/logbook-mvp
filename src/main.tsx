import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker (production only)
if ('serviceWorker' in navigator) {
  if ((import.meta as any).env && (import.meta as any).env.PROD) {
    const buildId = (typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : String(Date.now())) as string
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`/sw.js?build=${encodeURIComponent(buildId)}`)
        .then(() => console.log('✅ Service worker registered', { buildId }))
        .catch(console.error)
    })
  }
}
