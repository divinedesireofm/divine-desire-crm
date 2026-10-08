import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import Icon from './Icon'
import { sonidoActivo, setSonidoActivo, reproducirAviso } from '../lib/sonido'

export function hace(fecha) {
  if (!fecha) return ''
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

export default function NotificationBell() {
  const nt = useNotifications()
  const [abierto, setAbierto] = useState(false)
  const [sonido, setSonido] = useState(sonidoActivo())
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  if (!nt || !nt.activo) return null
  const { importantes, secundarias, marcarLeidas } = nt
  const total = importantes.length + secundarias.length

  function alternarSonido() {
    const nuevo = !sonido
    setSonido(nuevo)
    setSonidoActivo(nuevo)
    if (nuevo) reproducirAviso('importante', true) // al activarlo suena una vez para que se oiga cómo es
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((a) => !a)}
        className="relative p-2 rounded-full"
        style={{ background: 'var(--panel-alt)' }}
        aria-label="Notificaciones"
      >
        <Icon name="bell" size={18} />
        {importantes.length > 0 ? (
          <span
            className="absolute -top-1 -right-1 text-xs rounded-full w-4 h-4 flex items-center justify-center"
            style={{ background: 'var(--danger)', color: '#fff', fontSize: 10 }}
          >
            {importantes.length > 9 ? '9+' : importantes.length}
          </span>
        ) : secundarias.length > 0 ? (
          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--text-muted)', border: '2px solid var(--panel-alt)' }} />
        ) : null}
      </button>

      {abierto && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[90vw] max-h-[28rem] overflow-y-auto rounded-lg z-50 animate-in"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
        >
          {total === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Estás al día. No hay avisos pendientes.</p>
          ) : (
            <>
              <div className="px-4 py-2 flex justify-end" style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => marcarLeidas([...importantes, ...secundarias].map((a) => a.key))}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Marcar todas como leídas
                </button>
              </div>

              {importantes.map((a) => (
                <div key={a.key} className="px-4 py-3 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => { setAbierto(false); navigate(a.ruta || '/') }} className="text-left block w-full">
                    {a.texto}
                  </button>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{hace(a.fecha)}</span>
                    <button onClick={() => marcarLeidas([a.key])} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Marcar como leída</button>
                  </div>
                </div>
              ))}

              {secundarias.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Actividad del equipo</p>
                  {secundarias.slice(0, 30).map((a) => (
                    <div key={a.key} className="px-4 py-1.5 text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex-1">{a.texto} <span style={{ opacity: 0.7 }}>· {hace(a.fecha)}</span></span>
                      <button onClick={() => marcarLeidas([a.key])} className="hover:underline shrink-0" style={{ color: 'var(--accent)' }} aria-label="Marcar como leída">✓</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          <div className="px-4 py-2 flex items-center justify-between text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <span>{sonido ? '🔊 Sonido de avisos activado' : '🔇 Sonido de avisos desactivado'}</span>
            <button onClick={alternarSonido} className="hover:underline" style={{ color: 'var(--accent)' }}>{sonido ? 'Desactivar' : 'Activar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
