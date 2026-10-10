import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { textoPlan, textoDia } from './IGPlans'

const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

// Vista de la modelo: las planificaciones de reels que el equipo le ha enviado (solo las de sus cuentas).
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
      <PageHeader title="Envío de reels" subtitle="Las planificaciones de reels que te ha enviado el equipo, listas para grabar." />
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      {loading ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p></Panel>
      ) : planes.length === 0 ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes ninguna planificación. Cuando el equipo te envíe una, aparecerá aquí.</p></Panel>
      ) : planes.map((p) => {
        const on = abierto === p.id
        const texto = textoPlan(p, p.usuario)
        return (
          <Panel key={p.id} className="p-5 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => setAbierto(on ? null : p.id)} className="text-left">
                <p className="font-medium">@{String(p.usuario || '').replace(/^@/, '')} · {p.titulo}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enviada el {fmtExacta(p.enviado_at)} · {(p.dias || []).length} días</p>
              </button>
              <div className="flex items-center gap-3">
                <CopyButton text={texto} label="Copiar todo" />
                <button onClick={() => setAbierto(on ? null : p.id)} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{on ? 'Ocultar' : 'Ver'}</button>
              </div>
            </div>
            {on && (
              <>
                <pre className="text-sm whitespace-pre-wrap break-words rounded-md p-3 mt-4" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', fontFamily: 'inherit' }}>{texto}</pre>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(p.dias || []).map((d, i) => <CopyButton key={i} text={textoDia(d, i)} label={`Copiar día ${i + 1}`} />)}
                </div>
              </>
            )}
          </Panel>
        )
      })}
    </div>
  )
}
