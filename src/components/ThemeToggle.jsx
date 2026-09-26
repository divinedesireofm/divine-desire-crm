import { useState } from 'react'
import Icon from './Icon'

export default function ThemeToggle() {
  const [tema, setTema] = useState(() => localStorage.getItem('dd-theme') || 'dark')

  function alternar() {
    const nuevo = tema === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', nuevo)
    localStorage.setItem('dd-theme', nuevo)
    setTema(nuevo)
  }

  return (
    <button
      onClick={alternar}
      className="p-2 rounded-full"
      style={{ background: 'var(--panel-alt)' }}
      aria-label="Cambiar tema"
      title={tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      <Icon name={tema === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  )
}
