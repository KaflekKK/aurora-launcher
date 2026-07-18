import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/launcher.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Nie znaleziono elementu root.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)