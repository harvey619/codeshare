import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getTheme } from './theme'

// Set the theme before the first paint so pages don't flash light then fade to dark.
document.documentElement.dataset.theme = getTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
