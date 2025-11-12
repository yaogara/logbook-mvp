import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Developer diagnostics
if (!(import.meta.env?.PROD)) {
  console.log('%cLogbook MVP 🌿', 'color: lime; font-weight: bold; font-size: 14px')
  console.log('Environment:', import.meta.env?.MODE)
  if (!import.meta.env?.VITE_SUPABASE_URL || !import.meta.env?.VITE_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Missing Supabase env vars — check Vercel project settings.')
  }
}

if ('serviceWorker' in navigator && import.meta.env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('✅ Service worker registered', registration.scope)
      })
      .catch((error) => {
        console.error('Service worker registration failed', error)
      })
  })
}
