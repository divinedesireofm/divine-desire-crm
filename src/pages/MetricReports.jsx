import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import InformeView from '../components/InformeView'

const fmt = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function MetricReports() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.from('metric_reports').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setErr(error.message.includes('metric_reports') ? 'Falta ejecutar la migración 59 en Supabase.' : error.message)
    else setErr('')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  async function borrar(r) {
    if (!window.confirm(`¿Borrar el informe «${r.titulo}»? No se puede deshacer.`)) return
    const { error } = await supabase.from('metric_reports').delete().eq('id', r.id)
    if (error) { setErr(error.message); return }
    setAbierto(null); cargar()
  }

  const lista = rows.filter((r) => filtro === 'todos' || (filtro === 'equipo' ? r.tipo === 'equipo' : r.tipo === 'chatter'))

  if (abierto) {
    const r = rows.find((x) => x.id === abierto)
    if (!r) { setAbierto(null); return null }
    return (
      <div>
        <button className="text-sm underline mb-4" onClick={() => setAbierto(null)}>← Volver a los informes</button>
        <Panel className="p-6">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Generado el {fmt(r.created_at)} · {r.tipo === 'equipo' ? 'Todo el equipo' : r.chatter_nombre || 'Chatter'}</p>
          {r.contexto && (
            <details className="mb-4 text-sm"><summary className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>Contexto que escribiste</summary><p className="mt-2 whitespace-pre-wrap">{r.contexto}</p></details>
          )}
          <InformeView
            titulo={r.titulo} subtitulo={`Generado el ${fmt(r.created_at)} · ${r.periodo}`} markdown={r.contenido}
            acciones={<Button variant="danger" onClick={() => borrar(r)}>Borrar informe</Button>}
          />
        </Panel>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Informes de métricas" subtitle="Los análisis con IA que generas desde Métricas de chatters se guardan aquí. Ábrelos y expórtalos a PDF cuando quieras." />
      <div className="mb-4 max-w-[220px]">
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="chatter">Por chatter</option>
          <option value="equipo">De todo el equipo</option>
        </Select>
      </div>
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        : !lista.length ? <Panel className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay informes. Genera uno con «✨ Generar análisis» en Métricas de chatters.</Panel>
        : (
          <div className="space-y-2">
            {lista.map((r) => (
              <Panel key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <button className="text-left flex-1 min-w-[220px]" onClick={() => setAbierto(r.id)}>
                  <p className="text-sm font-medium">{r.tipo === 'equipo' ? '👥' : '👤'} {r.titulo}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmt(r.created_at)}{r.contexto ? ` · «${r.contexto.slice(0, 80)}${r.contexto.length > 80 ? '…' : ''}»` : ''}</p>
                </button>
                <div className="flex gap-3 text-xs">
                  <button className="underline" onClick={() => setAbierto(r.id)}>Abrir</button>
                  <button className="underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(r)}>Borrar</button>
                </div>
              </Panel>
            ))}
          </div>
        )}
    </div>
  )
}
