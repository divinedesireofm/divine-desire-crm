import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'

const DIAS_ALERTA_CONTENIDO = 14

export default function NotificationBell() {
  const { hasAnyRole } = useAuth()
  const puedeVer = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [abierto, setAbierto] = useState(false)
  const [avisos, setAvisos] = useState([])
  const navigate = useNavigate()

  async function cargar() {
    const hace14dias = new Date(Date.now() - DIAS_ALERTA_CONTENIDO * 86400000).toISOString().slice(0, 10)
    const hace3dias = new Date(Date.now() - 3 * 86400000).toISOString()

    const [{ data: contenido }, { data: pendientes }, { data: sanciones }] = await Promise.all([
      supabase.from('content_assignments').select('titulo, models(stage_name)').lte('enviado_en', hace14dias).is('hecho_en', null).not('enviado_en', 'is', null),
      supabase.from('profiles').select('full_name').eq('password_set', false),
      supabase.from('sanctions').select('motivo, profiles(full_name)').gte('created_at', hace3dias).order('created_at', { ascending: false }),
    ])

    const lista = []
    ;(contenido || []).forEach((c) => lista.push({ tipo: 'contenido', texto: `${c.models?.stage_name}: "${c.titulo}" lleva más de 14 días sin entregarse`, ruta: '/contenido' }))
    ;(pendientes || []).forEach((p) => lista.push({ tipo: 'pendiente', texto: `${p.full_name} todavía no ha creado su contraseña`, ruta: '/equipo' }))
    ;(sanciones || []).forEach((s) => lista.push({ tipo: 'sancion', texto: `Sanción reciente a ${s.profiles?.full_name}: ${s.motivo}`, ruta: '/sanciones' }))
    setAvisos(lista)
  }

  useEffect(() => {
    if (!puedeVer) return
    cargar()
    const poll = setInterval(cargar, 60000)
    return () => clearInterval(poll)
  }, [puedeVer])

  if (!puedeVer) return null

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        className="relative p-2 rounded-full"
        style={{ background: 'var(--panel-alt)' }}
        aria-label="Notificaciones"
      >
        <Icon name="bell" size={18} />
        {avisos.length > 0 && (
          <span
            className="absolute -top-1 -right-1 text-xs rounded-full w-4 h-4 flex items-center justify-center"
            style={{ background: 'var(--danger)', color: '#fff', fontSize: 10 }}
          >
            {avisos.length > 9 ? '9+' : avisos.length}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg z-50 animate-in"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
        >
          <p className="px-4 py-3 text-sm font-medium" style={{ borderBottom: '1px solid var(--border)' }}>Notificaciones</p>
          {avisos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Nada que necesite tu atención ahora mismo.</p>
          ) : (
            avisos.map((a, i) => (
              <button
                key={i}
                onClick={() => { setAbierto(false); navigate(a.ruta) }}
                className="w-full text-left px-4 py-3 text-sm block"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {a.texto}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
