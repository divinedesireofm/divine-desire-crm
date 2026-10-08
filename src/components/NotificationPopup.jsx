import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import { useAuth } from '../context/AuthContext'
import { hace } from './NotificationBell'
import { Panel, Button } from './ui'

// Ventana emergente con los avisos importantes sin leer. Sale UNA sola vez, al iniciar sesión /
// entrar al CRM. Los avisos que lleguen después no abren la ventana: aparecen en la campana.
// Se puede cerrar para seguir trabajando, pero los avisos no desaparecen hasta que se marcan
// como leídos: volverá a salir en la próxima entrada.
function yaMostrada(id) { try { return sessionStorage.getItem('dd_popup_' + id) === '1' } catch { return false } }
function marcarMostrada(id) { try { sessionStorage.setItem('dd_popup_' + id, '1') } catch { /* sin almacenamiento: se mostrará una vez por carga */ } }

export default function NotificationPopup() {
  const nt = useNotifications()
  const { profile } = useAuth()
  const [abierta, setAbierta] = useState(false)
  const [decidido, setDecidido] = useState(false) // ya se decidió si toca mostrarla en esta entrada
  const navigate = useNavigate()

  const importantes = nt?.importantes || []

  // Solo en la primera carga tras entrar: si hay avisos sin leer, se abre. Después nunca se reabre sola.
  useEffect(() => {
    if (!nt?.cargado || !profile || decidido) return
    setDecidido(true)
    if (yaMostrada(profile.id)) return
    marcarMostrada(profile.id)
    if (importantes.length > 0) setAbierta(true)
  }, [nt?.cargado, profile, decidido])

  // Si se marcan todos como leídos, se cierra sola
  useEffect(() => { if (importantes.length === 0) setAbierta(false) }, [importantes.length])

  if (!nt || !abierta || importantes.length === 0) return null

  function cerrar() { setAbierta(false) }

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
