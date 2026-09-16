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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fModelo, setFModelo] = useState('todos')
  const [fEstado, setFEstado] = useState('pendientes')
  const [nuevo, setNuevo] = useState({ model_id: '', titulo: '' })
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from('models').select('id, stage_name').order('stage_name'),
      supabase.from('content_assignments').select('*, models(stage_name)').order('created_at', { ascending: false }),
    ])
    setModelos(m || [])
    setRows(r || [])
    if (m?.length && !nuevo.model_id) setNuevo((n) => ({ ...n, model_id: m[0].id }))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!nuevo.titulo.trim()) { setError('Describe qué contenido le has pedido.'); return }
    await supabase.from('content_assignments').insert([{
      model_id: nuevo.model_id, titulo: nuevo.titulo.trim(), creado_por: profile.id,
    }])
    setNuevo({ model_id: nuevo.model_id, titulo: '' })
    load()
  }

  async function marcarHecho(row) {
    await supabase.from('content_assignments').update({ hecho_en: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    load()
  }
  async function recordar(row) {
    await supabase.from('content_assignments').update({ recordado_en: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    load()
  }
  async function borrar(row) {
    if (!confirm('¿Eliminar este contenido de la lista?')) return
    await supabase.from('content_assignments').delete().eq('id', row.id)
    load()
  }

  const visibles = rows
    .filter((r) => fModelo === 'todos' || r.model_id === fModelo)
    .filter((r) => fEstado === 'todos' || (fEstado === 'pendientes' ? !r.hecho_en : !!r.hecho_en))

  return (
    <div>
      <PageHeader
        title="Contenido pedido a las modelos"
        subtitle="Enviado → hecho. Si pasan 2 semanas sin marcarse como hecho, salta la alerta."
      />

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-3">Pedir contenido nuevo</p>
        <form onSubmit={crear} className="flex gap-2 flex-wrap">
          <Select value={nuevo.model_id} onChange={(e) => setNuevo({ ...nuevo, model_id: e.target.value })} className="max-w-[200px]">
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
          </Select>
          <Input
            className="flex-1 min-w-[240px]"
            placeholder="Qué contenido le has pedido (ej: set lencería roja, 10 fotos)"
            value={nuevo.titulo}
            onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
          />
          <Button type="submit">Añadir (enviado hoy)</Button>
        </form>
        {error && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      </Panel>

      <div className="flex gap-2 mb-4">
        <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)} className="max-w-[200px]">
          <option value="todos">Todas las modelos</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="max-w-[160px]">
          <option value="pendientes">Pendientes</option>
          <option value="hechos">Hechos</option>
          <option value="todos">Todos</option>
        </Select>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Nada por aquí.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Modelo', 'Contenido', 'Enviado', 'Hecho', ''].map((c) => (
                  <th key={c} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const desde = diasDesde(r.recordado_en || r.enviado_en)
                const alerta = !r.hecho_en && desde >= DIAS_ALERTA
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: alerta ? 'var(--danger)11' : 'transparent' }}>
                    <td className="px-4 py-3"><strong>{r.models?.stage_name}</strong></td>
                    <td className="px-4 py-3">
                      {r.titulo}
                      {alerta && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--danger)22', color: 'var(--danger)' }}>
                          ⚠️ {desde} días sin hacerse
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {r.enviado_en}
                      {r.recordado_en && <div className="text-xs">recordado {r.recordado_en}</div>}
                    </td>
                    <td className="px-4 py-3" style={{ color: r.hecho_en ? 'var(--success)' : 'var(--text-muted)' }}>
                      {r.hecho_en || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {!r.hecho_en && (
                        <>
                          {alerta && (
                            <button onClick={() => recordar(r)} className="text-xs hover:underline mr-3" style={{ color: 'var(--gold)' }}>
                              Ya se lo he recordado
                            </button>
                          )}
                          <button onClick={() => marcarHecho(r)} className="text-xs hover:underline mr-3" style={{ color: 'var(--success)' }}>
                            Marcar hecho
                          </button>
                        </>
                      )}
                      <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
