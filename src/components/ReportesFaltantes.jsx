import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getExtrabajadorIds } from '../lib/roles'
import { calcularFaltantes, DIAS_REVISION } from '../lib/reportesFaltantes'
import { fechaHoraDoble } from '../lib/horasTurno'
import { Panel } from './ui'

// Aviso para admin y managers: turnos trabajados (entrada + salida) de los que el chatter no envió el reporte
export default function ReportesFaltantes({ enlace = false }) {
  const { hasAnyRole, hasRole, profile } = useAuth()
  const esAdmin = hasRole('admin')
  const aplica = hasAnyRole(['admin', 'manager'])
  const [faltan, setFaltan] = useState([])
  const [abierto, setAbierto] = useState(true)
  const [descartados, setDescartados] = useState([]) // turnos cuyo aviso quitó el admin
  const [verDesc, setVerDesc] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!aplica) return undefined
    let vivo = true
    async function cargar() {
      const desde = new Date(Date.now() - DIAS_REVISION * 86400000).toISOString()
      const [ev, rp, ak, ex, ds] = await Promise.all([
        supabase.from('attendance_events').select('id, chatter_id, tipo, created_at, profiles(full_name)').gte('created_at', desde).order('created_at', { ascending: true }).limit(3000),
        supabase.from('shift_reports').select('chatter_id, created_at').gte('created_at', new Date(Date.now() - (DIAS_REVISION + 1) * 86400000).toISOString()).limit(3000),
        supabase.from('shift_report_acks').select('event_id').limit(3000),
        getExtrabajadorIds(),
        supabase.from('reportes_faltantes_descartados').select('salida_id').limit(3000),
      ])
      if (!vivo || ev.error) return
      const idsDesc = new Set((ds.data || []).map((d) => d.salida_id))
      const base = { eventos: (ev.data || []).filter((e) => !ex.has(e.chatter_id)), reportes: rp.data || [] }
      const acks = new Set((ak.data || []).map((a) => a.event_id))
      setFaltan(calcularFaltantes({ ...base, acks: new Set([...acks, ...idsDesc]) }))
      // los quitados que de verdad seguían sin reporte (para poder restaurarlos)
      setDescartados(calcularFaltantes({ ...base, acks }).filter((f) => idsDesc.has(f.salidaId)))
    }
    cargar()
    const t = setInterval(cargar, 60000)
    window.addEventListener('shift-report-sent', cargar)
    return () => { vivo = false; clearInterval(t); window.removeEventListener('shift-report-sent', cargar) }
  }, [aplica, recarga])

  const porChatter = useMemo(() => {
    const m = {}
    faltan.forEach((f) => { (m[f.chatterId] = m[f.chatterId] || { nombre: f.nombre, turnos: [] }).turnos.push(f) })
    return Object.values(m).sort((a, b) => b.turnos.length - a.turnos.length || a.nombre.localeCompare(b.nombre, 'es'))
  }, [faltan])

  async function quitar(t) {
    if (!confirm(`¿Quitar el aviso del turno de ${t.nombre} (${fechaHoraDoble(t.salida)})? Solo desaparece este aviso; podrás restaurarlo.`)) return
    setErr('')
    const { error } = await supabase.from('reportes_faltantes_descartados').insert([{ salida_id: t.salidaId, chatter_id: t.chatterId, descartado_por: profile?.id }])
    if (error) { setErr(/does not exist|schema cache/i.test(error.message) ? 'Falta ejecutar la migración 111 en Supabase.' : 'No se pudo quitar: ' + error.message); return }
    setRecarga((n) => n + 1)
  }
  async function restaurar(t) {
    setErr('')
    const { error } = await supabase.from('reportes_faltantes_descartados').delete().eq('salida_id', t.salidaId)
    if (error) { setErr('No se pudo restaurar: ' + error.message); return }
    setRecarga((n) => n + 1)
  }

  if (!aplica || (!faltan.length && !(esAdmin && descartados.length))) return null
  return (
    <Panel className="p-4 mb-6" style={{ border: '1px solid var(--danger)' }} data-faltantes>
      <button type="button" onClick={() => setAbierto(!abierto)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="font-medium" style={{ color: 'var(--danger)' }}>
          {faltan.length ? `⚠️ ${faltan.length} ${faltan.length === 1 ? 'reporte de turno sin enviar' : 'reportes de turno sin enviar'} · ${porChatter.length} ${porChatter.length === 1 ? 'chatter' : 'chatters'}` : '✅ No quedan avisos de reportes sin enviar'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Turnos de los últimos {DIAS_REVISION} días en los que marcaron entrada y salida y no consta reporte.</p>
          {porChatter.map((c) => (
            <div key={c.nombre} className="text-sm">
              <p className="font-medium">{c.nombre} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {c.turnos.length} {c.turnos.length === 1 ? 'turno' : 'turnos'}</span></p>
              <ul className="mt-1 space-y-0.5">
                {c.turnos.map((t) => (
                  <li key={t.salidaId} className="text-xs flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                    <span>Entró {fechaHoraDoble(t.entrada)} → salió {fechaHoraDoble(t.salida)}</span>
                    {esAdmin && <button type="button" onClick={() => quitar(t)} data-quitar className="underline" style={{ color: 'var(--accent)' }}>Quitar aviso</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {esAdmin && descartados.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerDesc(!verDesc)} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{verDesc ? 'Ocultar' : 'Ver'} avisos quitados ({descartados.length})</button>
              {verDesc && (
                <ul className="mt-1 space-y-0.5">
                  {descartados.map((t) => (
                    <li key={t.salidaId} className="text-xs flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                      <span>{t.nombre} · salió {fechaHoraDoble(t.salida)}</span>
                      <button type="button" onClick={() => restaurar(t)} className="underline" style={{ color: 'var(--accent)' }}>Restaurar aviso</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          {enlace && <Link to="/reportes-turno" className="text-xs underline" style={{ color: 'var(--accent)' }}>Ir a Reportes de turno</Link>}
        </div>
      )}
    </Panel>
  )
}
