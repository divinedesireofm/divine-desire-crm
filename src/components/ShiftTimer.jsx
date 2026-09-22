import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function fmt(ms) {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function ShiftTimer() {
  const { profile } = useAuth()
  const [estado, setEstado] = useState(null) // null (fuera de turno) | { entradaTs, enBreak, breakDesdeTs }
  const [ahora, setAhora] = useState(Date.now())

  async function refrescarEstado() {
    if (!profile) return
    const { data } = await supabase
      .from('attendance_events')
      .select('tipo, created_at')
      .eq('chatter_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(15)

    if (!data?.length || data[0].tipo === 'salida') { setEstado(null); return }

    const entrada = data.find((e) => e.tipo === 'entrada')
    if (!entrada) { setEstado(null); return }

    const enBreak = data[0].tipo === 'break'
    setEstado({
      entradaTs: new Date(entrada.created_at).getTime(),
      enBreak,
      breakDesdeTs: enBreak ? new Date(data[0].created_at).getTime() : null,
    })
  }

  useEffect(() => {
    refrescarEstado()
    const poll = setInterval(refrescarEstado, 20000)
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    window.addEventListener('attendance-changed', refrescarEstado)
    return () => {
      clearInterval(poll); clearInterval(tick)
      window.removeEventListener('attendance-changed', refrescarEstado)
    }
  }, [profile])

  if (!estado) return null

  return (
    <div
      className="flex items-center justify-center gap-6 py-1.5 text-sm shrink-0"
      style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}
    >
      <span style={{ color: 'var(--success)' }}>
        ⏱ En turno: <strong className="font-display">{fmt(ahora - estado.entradaTs)}</strong>
      </span>
      {estado.enBreak && (
        <span style={{ color: 'var(--gold)' }}>
          ☕ En break: <strong className="font-display">{fmt(ahora - estado.breakDesdeTs)}</strong>
        </span>
      )}
    </div>
  )
}
