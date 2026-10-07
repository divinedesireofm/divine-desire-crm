import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, } from '../context/NotificationsContext'
import { hace } from './NotificationBell'
import { Panel, Button } from './ui'

// Ventana emergente con los avisos importantes sin leer. Sale al entrar al CRM y cada vez
// que llega uno nuevo. Se puede cerrar para seguir trabajando, pero los avisos no desaparecen
// hasta que se marcan como leídos: volverá a salir en la próxima entrada.
export default function NotificationPopup() {
  const nt = useNotifications()
  const [abierta, setAbierta] = useState(false)
  const vistas = useRef(new Set())
  const navigate = useNavigate()

  const importantes = nt?.importantes || []
  const claves = importantes.map((i) => i.key).join('|')

  useEffect(() => {
    if (!nt?.cargado) return
    if (importantes.some((i) => !vistas.current.has(i.key))) setAbierta(true)
    if (importantes.length === 0) setAbierta(false)
  }, [claves, nt?.cargado])

  if (!nt || !abierta || importantes.length === 0) return null

  function cerrar() {
    importantes.forEach((i) => vistas.current.add(i.key))
    setAbierta(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-16" style={{ background: 'rgba(0,0,0,0.55)' }} role="dialog" aria-modal="true" aria-label="Avisos pendientes">
      <Panel className="w-full max-w-lg max-h-[80vh] flex flex-col" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-medium">Tienes {importantes.length} {importantes.length === 1 ? 'aviso' : 'avisos'} sin leer</p>
          <button onClick={cerrar} aria-label="Cerrar" className="text-sm" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="overflow-y-auto">
          {importantes.map((a) => (
            <div key={a.key} className="px-5 py-3 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
              <p>{a.texto}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{hace(a.fecha)}</span>
                <div className="flex gap-3">
                  <button onClick={() => { cerrar(); navigate(a.ruta || '/') }} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>Ir</button>
                  <button onClick={() => nt.marcarLeidas([a.key])} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Marcar como leída</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="ghost" onClick={cerrar}>Cerrar por ahora</Button>
          <Button onClick={() => nt.marcarLeidas(importantes.map((i) => i.key))}>Marcar todas como leídas</Button>
        </div>
      </Panel>
    </div>
  )
}
