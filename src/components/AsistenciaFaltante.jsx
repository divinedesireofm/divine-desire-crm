import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cargarFaltasAsistencia, textoFalta } from '../lib/asistenciaFaltante'
import { fechaHoraDoble, horarioTurno } from '../lib/horasTurno'
import { PERMISO_QUITAR_AVISOS } from '../lib/navigation'
import { Panel } from './ui'

const NOMBRE_TURNO = { noche: 'Mañana', 'mañana': 'Tarde', tarde: 'Noche', madrugada: 'Mañana' }

// Aviso para admin y managers: chatters con turno en el horario que no han marcado entrada y/o salida
export default function AsistenciaFaltante() {
  const { hasAnyRole, puedeVer, profile } = useAuth()
  const enReportesTurno = useLocation().pathname.startsWith('/reportes-turno') // los avisos de fichajes van en Entradas y salidas, no aquí
  const aplica = hasAnyRole(['admin', 'manager'])
  const puedeQuitar = puedeVer(PERMISO_QUITAR_AVISOS, ['admin'])
  const [faltas, setFaltas] = useState([])
  const [quitadas, setQuitadas] = useState([])
  const [abierto, setAbierto] = useState(true)
  const [verQuit, setVerQuit] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!aplica) return undefined
    let vivo = true
    async function cargar() {
      const r = await cargarFaltasAsistencia()
      if (vivo) { setFaltas(r.faltas); setQuitadas(r.quitadas) }
    }
    cargar()
    const t = setInterval(cargar, 60000)
    window.addEventListener('attendance-changed', cargar)
    return () => { vivo = false; clearInterval(t); window.removeEventListener('attendance-changed', cargar) }
  }, [aplica, recarga])

  const porChatter = useMemo(() => {
    const m = {}
    faltas.forEach((f) => { (m[f.chatterId] = m[f.chatterId] || { nombre: f.nombre, items: [] }).items.push(f) })
    return Object.values(m).sort((a, b) => b.items.length - a.items.length || a.nombre.localeCompare(b.nombre, 'es'))
  }, [faltas])

  async function quitar(f) {
    if (!confirm(`¿Quitar el aviso de ${f.nombre} (turno ${NOMBRE_TURNO[f.turno] || f.turno} del ${f.fecha.split('-').reverse().join('/')})? Podrás restaurarlo.`)) return
    setErr('')
    const { error } = await supabase.from('avisos_turno_descartados').insert([{ clave: f.clave, schedule_id: f.scheduleId, chatter_id: f.chatterId, tipo: f.tipo, descartado_por: profile?.id }])
    if (error) { setErr(/does not exist|schema cache/i.test(error.message) ? 'Falta ejecutar la migración 135 en Supabase.' : 'No se pudo quitar: ' + error.message); return }
    setRecarga((n) => n + 1)
  }
  async function restaurar(f) {
    setErr('')
    const { error } = await supabase.from('avisos_turno_descartados').delete().eq('clave', f.clave)
    if (error) { setErr('No se pudo restaurar: ' + error.message); return }
    setRecarga((n) => n + 1)
  }

  if (enReportesTurno || !aplica || (!faltas.length && !(puedeQuitar && quitadas.length))) return null
  return (
    <Panel className="p-4 mb-6" style={{ border: '1px solid var(--gold)' }} data-asistencia-faltante>
      <button type="button" onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="font-medium" style={{ color: 'var(--gold)' }}>
          {faltas.length ? `🕒 ${faltas.length} ${faltas.length === 1 ? 'fichaje que falta' : 'fichajes que faltan'} según el horario · ${porChatter.length} ${porChatter.length === 1 ? 'chatter' : 'chatters'}` : '✅ No quedan avisos de fichajes'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Turnos del horario de los últimos días en los que el chatter no ha marcado la entrada o la salida.</p>
          {porChatter.map((c) => (
            <div key={c.nombre} className="text-sm">
              <p className="font-medium">{c.nombre} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {c.items.length} {c.items.length === 1 ? 'aviso' : 'avisos'}</span></p>
              <ul className="mt-1 space-y-0.5">
                {c.items.map((f) => (
                  <li key={f.clave} className="text-xs flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                    <span>
                      <strong style={{ color: 'var(--text)' }}>{NOMBRE_TURNO[f.turno] || f.turno}</strong> · {fechaHoraDoble(f.inicio)} · {textoFalta(f, fechaHoraDoble)}
                    </span>
                    {puedeQuitar && <button type="button" onClick={() => quitar(f)} data-quitar-asistencia className="underline" style={{ color: 'var(--accent)' }}>Quitar aviso</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {puedeQuitar && quitadas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerQuit(!verQuit)} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{verQuit ? 'Ocultar' : 'Ver'} avisos quitados ({quitadas.length})</button>
              {verQuit && (
                <ul className="mt-1 space-y-0.5">
                  {quitadas.map((f) => (
                    <li key={f.clave} className="text-xs flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                      <span>{f.nombre} · {NOMBRE_TURNO[f.turno] || f.turno} {f.fecha.split('-').reverse().join('/')} · {horarioTurno(f.turno)}</span>
                      <button type="button" onClick={() => restaurar(f)} className="underline" style={{ color: 'var(--accent)' }}>Restaurar aviso</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>
      )}
    </Panel>
  )
}
