import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

function fmtFecha(ts) { return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) }

export default function ModelRequests() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendientes')
  const [respuestas, setRespuestas] = useState({}) // { id: texto en curso }

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('model_requests').select('*, models(stage_name)').order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function responder(id) {
    const respuesta = (respuestas[id] || '').trim()
    await supabase.from('model_requests').update({ estado: 'atendida', respuesta: respuesta || null, respondida_en: new Date().toISOString() }).eq('id', id)
    setRespuestas((r) => ({ ...r, [id]: '' }))
    load()
  }

  const visibles = rows.filter((r) => filtro === 'todas' || (filtro === 'pendientes' ? r.estado !== 'atendida' : r.estado === 'atendida'))

  return (
    <div>
      <PageHeader title="Solicitudes de las modelos" subtitle="Lo que las modelos piden desde su propio portal." />

      <div className="mb-6 max-w-xs">
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="pendientes">Pendientes</option>
          <option value="atendidas">Atendidas</option>
          <option value="todas">Todas</option>
        </Select>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Nada por aquí.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visibles.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-sm">{r.models?.stage_name}</strong>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtFecha(r.created_at)}</span>
                </div>
                <p className="text-sm mb-2">{r.mensaje}</p>
                {r.estado === 'atendida' ? (
                  <p className="text-sm" style={{ color: 'var(--success)' }}>✅ Atendida{r.respuesta ? `: ${r.respuesta}` : ''}</p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Respuesta (opcional)"
                      value={respuestas[r.id] || ''}
                      onChange={(e) => setRespuestas((res) => ({ ...res, [r.id]: e.target.value }))}
                    />
                    <Button onClick={() => responder(r.id)}>Marcar atendida</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
