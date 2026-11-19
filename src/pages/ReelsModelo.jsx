import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'
import PlanContenido from './IGPlanView'

const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const totalReels = (p) => (p.dias || []).reduce((a, d) => a + (d.reels?.length || 0), 0)

// Vista de la modelo (pensada para el móvil): sus planificaciones enviadas, separadas en «Por hacer» y «Hechas».
// Una planificación pasa sola a «Hechas» cuando la modelo marca todos sus reels (o si el equipo la dio por hecha).
export default function ReelsModelo() {
  const [planes, setPlanes] = useState([])
  const [hechos, setHechos] = useState({}) // { planId: { 'dia:reel': true } }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [vista, setVista] = useState('porhacer')
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([supabase.rpc('mis_planificaciones'), supabase.rpc('mis_reels_hechos')]).then(([{ data, error: err }, { data: h }]) => {
      if (err) setError('No se pudieron cargar tus planificaciones.')
      const m = {}
      ;(h || []).forEach((x) => { (m[x.plan_id] = m[x.plan_id] || {})[x.dia + ':' + x.reel] = true })
      setHechos(m)
      const lista = data || []
      setPlanes(lista)
      const pend = lista.find((p) => !completa(p, m))
      if (pend) setAbierto(pend.id)
      else if (lista.length) setVista('hechas')
      setLoading(false)
    })
  }, [])

  const hechosDe = (id, m = hechos) => Object.keys(m[id] || {}).length
  function completa(p, m = hechos) {
    if (p.hecha_at) return true
    const t = totalReels(p)
    return t > 0 && hechosDe(p.id, m) >= t
  }

  const porHacer = useMemo(() => planes.filter((p) => !completa(p)), [planes, hechos])
  const hechas = useMemo(() => planes.filter((p) => completa(p)), [planes, hechos])
  const lista = vista === 'porhacer' ? porHacer : hechas

  // Cuando la modelo marca o desmarca un reel, se actualiza el recuento y, si cambia de estado, la planificación se mueve de pestaña
  function alCambiar(planId, clave, hecho) {
    const plan = planes.find((p) => p.id === planId)
    const antes = plan ? completa(plan) : false
    const nuevo = { ...hechos, [planId]: { ...(hechos[planId] || {}) } }
    if (hecho) nuevo[planId][clave] = true; else delete nuevo[planId][clave]
    setHechos(nuevo)
    const despues = plan ? completa(plan, nuevo) : false
    if (plan && antes !== despues) {
      setAbierto(null)
      setToast(despues ? '🎉 ¡Planificación completada! Ahora está en «Hechas».' : 'Planificación devuelta a «Por hacer».')
      setTimeout(() => setToast(''), 4500)
    }
  }

  return (
    <div>
      <PageHeader title="Planificaciones" subtitle="Tus reels listos para grabar. Marca cada uno al hacerlo." />
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      {toast && <p className="text-sm mb-3 rounded-md px-3 py-2" data-toast-plan style={{ background: 'var(--accent-soft)', color: 'var(--success, #30a46c)', border: '1px solid var(--success, #30a46c)' }}>{toast}</p>}

      <div className="grid grid-cols-2 gap-2 mb-4" role="tablist">
        {[['porhacer', 'Por hacer', porHacer.length], ['hechas', 'Hechas', hechas.length]].map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} data-pestana-modelo={id} onClick={() => setVista(id)}
            className="rounded-xl py-3 text-sm font-medium"
            style={{ background: vista === id ? 'var(--accent)' : 'var(--panel)', color: vista === id ? '#0B1020' : 'var(--text)', border: `1px solid ${vista === id ? 'var(--accent)' : 'var(--border)'}` }}>
            {id === 'hechas' ? '✅ ' : '📝 '}{label} <span data-contador={id}>({n})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p></Panel>
      ) : planes.length === 0 ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes ninguna planificación. Cuando el equipo te envíe una, aparecerá aquí.</p></Panel>
      ) : lista.length === 0 ? (
        <Panel><p className="p-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>{vista === 'porhacer' ? '🎉 No tienes nada pendiente. Todas tus planificaciones están hechas.' : 'Aún no has completado ninguna planificación. Cuando marques todos sus reels, aparecerá aquí.'}</p></Panel>
      ) : lista.map((p) => {
        const on = abierto === p.id
        const t = totalReels(p)
        const h = p.hecha_at && !hechosDe(p.id) ? t : hechosDe(p.id)
        const pct = t ? Math.min(100, Math.round((h / t) * 100)) : 0
        return (
          <Panel key={p.id} className="p-4 sm:p-5 mb-3" data-plan-modelo={p.id}>
            <button onClick={() => setAbierto(on ? null : p.id)} className="w-full text-left flex items-start justify-between gap-3" aria-expanded={on}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">@{String(p.usuario || '').replace(/^@/, '')} · {p.titulo}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enviada el {fmtExacta(p.enviado_at)} · {(p.dias || []).length} días · {t} reels</span>
                {t > 0 && (
                  <span className="flex items-center gap-2 mt-2">
                    <span className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <span className="block h-full" data-barra={p.id} style={{ width: pct + '%', background: 'var(--success, #30a46c)' }} />
                    </span>
                    <span className="text-xs tabular-nums whitespace-nowrap" data-progreso-card={p.id} style={{ color: 'var(--text-muted)' }}>{h}/{t}</span>
                  </span>
                )}
              </span>
              <span className="text-xs underline shrink-0 pt-0.5" style={{ color: 'var(--text-muted)' }}>{on ? 'Ocultar' : 'Ver'}</span>
            </button>
            {on && <div className="mt-4"><PlanContenido plan={p} usuario={p.usuario} paraModelo onHechos={alCambiar} /></div>}
          </Panel>
        )
      })}
    </div>
  )
}
