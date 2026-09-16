import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const DIAS_ALERTA = 14

function diasDesde(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00')
  const hoy = new Date()
  return Math.floor((hoy - d) / (1000 * 60 * 60 * 24))
}

export default function ContentAssignments() {
  const { profile } = useAuth()
  const [modelos, setModelos] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [error, setError] = useState('')

  async function loadModelos() {
    const { data } = await supabase.from('models').select('id, stage_name').order('stage_name')
    setModelos(data || [])
    if (data?.length && !selectedModel) setSelectedModel(data[0].id)
  }

  async function loadRows(modelId) {
    if (!modelId) return
    setLoading(true)
    const { data } = await supabase
      .from('content_assignments')
      .select('*')
      .eq('model_id', modelId)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadModelos() }, [])
  useEffect(() => { loadRows(selectedModel) }, [selectedModel])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!nuevoTitulo.trim()) { setError('Describe qué contenido le has pedido.'); return }
    await supabase.from('content_assignments').insert([{
      model_id: selectedModel, titulo: nuevoTitulo.trim(), creado_por: profile.id,
    }])
    setNuevoTitulo('')
    loadRows(selectedModel)
  }

  async function moverAHecho(row) {
    await supabase.from('content_assignments').update({ hecho_en: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    loadRows(selectedModel)
  }
  async function devolverAEnviado(row) {
    await supabase.from('content_assignments').update({ hecho_en: null }).eq('id', row.id)
    loadRows(selectedModel)
  }
  async function recordar(row) {
    await supabase.from('content_assignments').update({ recordado_en: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    loadRows(selectedModel)
  }
  async function borrar(row) {
    if (!confirm('¿Eliminar este contenido de la lista? (por ejemplo, si al final se cancela)')) return
    await supabase.from('content_assignments').delete().eq('id', row.id)
    loadRows(selectedModel)
  }

  const pendientes = rows.filter((r) => !r.hecho_en)
  const hechos = rows.filter((r) => r.hecho_en)

  return (
    <div>
      <PageHeader
        title="Contenido pedido a las modelos"
        subtitle="Elige la modelo y verás todo su contenido: lo pendiente y lo ya entregado."
      />

      <div className="mb-6 max-w-xs">
        <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
      </div>

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-3">Pedir contenido nuevo a esta modelo</p>
        <form onSubmit={crear} className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="Qué contenido le has pedido (ej: set lencería roja, 10 fotos)"
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
          />
          <Button type="submit">Añadir (enviado hoy)</Button>
        </form>
        {error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      </Panel>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Panel className="p-5">
            <p className="text-sm font-medium mb-4">📤 Enviado ({pendientes.length})</p>
            {pendientes.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nada pendiente.</p>
            ) : (
              <div className="space-y-3">
                {pendientes.map((r) => {
                  const desde = diasDesde(r.recordado_en || r.enviado_en)
                  const alerta = desde >= DIAS_ALERTA
                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-md"
                      style={{ background: alerta ? 'var(--danger)11' : 'var(--panel-alt)', border: `1px solid ${alerta ? 'var(--danger)' : 'var(--border)'}` }}
                    >
                      <p className="text-sm font-medium mb-1">{r.titulo}</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        Enviado {r.enviado_en}
                        {r.recordado_en && <> · recordado {r.recordado_en}</>}
                      </p>
                      {alerta && (
                        <p className="text-xs mb-2 font-medium" style={{ color: 'var(--danger)' }}>
                          ⚠️ {desde} días sin hacerse
                        </p>
                      )}
                      <div className="flex gap-3 flex-wrap">
                        {alerta && (
                          <button onClick={() => recordar(r)} className="text-xs hover:underline" style={{ color: 'var(--gold)' }}>
                            Ya se lo he recordado
                          </button>
                        )}
                        <button onClick={() => moverAHecho(r)} className="text-xs hover:underline" style={{ color: 'var(--success)' }}>
                          Mover a hecho →
                        </button>
                        <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>
                          Borrar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-medium mb-4">✅ Hecho ({hechos.length})</p>
            {hechos.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía nada entregado.</p>
            ) : (
              <div className="space-y-3">
                {hechos.map((r) => (
                  <div key={r.id} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-medium mb-1">{r.titulo}</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--success)' }}>Hecho el {r.hecho_en}</p>
                    <div className="flex gap-3">
                      <button onClick={() => devolverAEnviado(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                        ← Devolver a enviado
                      </button>
                      <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
