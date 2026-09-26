import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Aplica el tema guardado (o el oscuro por defecto) antes de pintar nada, para evitar el parpadeo
const temaGuardado = localStorage.getItem('dd-theme') || 'dark'
document.documentElement.setAttribute('data-theme', temaGuardado)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
