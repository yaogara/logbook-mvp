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
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('✅ Service worker registered'))
        .catch(console.error)
    })
  }
}
