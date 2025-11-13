// main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

// Mount React App
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

// ─────────────────────────────────────────────
// Developer diagnostics (DEV only)
// ─────────────────────────────────────────────
if (import.meta.env.MODE !== 'production') {
  console.log('%cLogbook MVP 🌿', 'color: lime; font-weight: bold; font-size: 14px')
  console.log('Environment:', import.meta.env.MODE)

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Missing Supabase env vars — check Vercel project settings.')
  }
}

// ─────────────────────────────────────────────
// Register Service Worker (PROD only)
// Adds a cache-busting build timestamp so new builds update correctly
// ─────────────────────────────────────────────
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const buildTag = String(Date.now()) // ensures new SW install on every deploy

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`/sw.js?build=${buildTag}`)
      .then(reg => {
        console.log('✅ Service worker registered:', reg.scope)
      })
      .catch(err => {
        console.error('❌ Service worker registration failed:', err)
      })
  })
}