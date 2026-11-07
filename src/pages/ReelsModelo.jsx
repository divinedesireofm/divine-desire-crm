import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'
import PlanContenido from './IGPlanView'

const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

// Vista de la modelo: las planificaciones de reels que el equipo le ha enviado (solo las de sus cuentas), con sus videos de referencia.
export default function ReelsModelo() {
  const [planes, setPlanes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    supabase.rpc('mis_planificaciones').then(({ data, error: err }) => {
      if (err) setError('No se pudieron cargar tus planificaciones.')
      setPlanes(data || [])
      if (data?.length) setAbierto(data[0].id)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Planificaciones" subtitle="Las planificaciones de reels de tus cuentas, listas para grabar." />
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      {loading ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p></Panel>
      ) : planes.length === 0 ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes ninguna planificación. Cuando el equipo te envíe una, aparecerá aquí.</p></Panel>
      ) : planes.map((p) => {
        const on = abierto === p.id
        return (
          <Panel key={p.id} className="p-5 mb-4">
            <button onClick={() => setAbierto(on ? null : p.id)} className="w-full text-left flex items-center justify-between gap-3 flex-wrap">
              <span>
                <span className="block font-medium">@{String(p.usuario || '').replace(/^@/, '')} · {p.titulo}</span>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Enviada el {fmtExacta(p.enviado_at)} · {(p.dias || []).length} días</span>
              </span>
              <span className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{on ? 'Ocultar' : 'Ver'}</span>
            </button>
            {on && <div className="mt-4"><PlanContenido plan={p} usuario={p.usuario} paraModelo /></div>}
          </Panel>
        )
      })}
    </div>
  )
}
