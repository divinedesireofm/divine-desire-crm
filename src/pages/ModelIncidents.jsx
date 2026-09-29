import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const TIPOS = { salud: 'Salud', conflicto: 'Conflicto', disciplinaria: 'Disciplinaria', otro: 'Otro' }
const ESTADO_COLOR = { abierta: 'var(--danger)', resuelta: 'var(--success)' }

export default function ModelIncidents() {
  const { profile } = useAuth()
  const [modelos, setModelos] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('abiertas')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ model_id: '', tipo: 'otro', descripcion: '' })

  async function load() {
    setLoading(true)
    const [{ data: m }, { data: inc }] = await Promise.all([
      supabase.from('models').select('id, stage_name').order('stage_name'),
      supabase.from('model_incidents').select('*, models(stage_name)').order('created_at', { ascending: false }),
    ])
    setModelos(m || [])
    setRows(inc || [])
    if (m?.length && !form.model_id) setForm((f) => ({ ...f, model_id: m[0].id }))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    if (!form.descripcion.trim()) return
    await supabase.from('model_incidents').insert([{ ...form, descripcion: form.descripcion.trim(), creado_por: profile.id }])
    setForm((f) => ({ ...f, descripcion: '' }))
    setShowForm(false)
    load()
  }

  async function resolver(inc) {
    await supabase.from('model_incidents').update({ estado: inc.estado === 'abierta' ? 'resuelta' : 'abierta' }).eq('id', inc.id)
    load()
  }
  async function borrar(inc) {
    if (!confirm('¿Eliminar esta incidencia?')) return
    await supabase.from('model_incidents').delete().eq('id', inc.id)
    load()
  }

  const visibles = rows.filter((r) => filtro === 'todas' || r.estado === (filtro === 'abiertas' ? 'abierta' : 'resuelta'))

  return (
    <div>
      <PageHeader
        title="Incidencias de modelos"
        subtitle="Notas e incidencias sobre la modelo (no de su cuenta de Instagram)."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nueva incidencia'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input placeholder="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            <Button type="submit" className="sm:col-span-3">Guardar</Button>
          </form>
        </Panel>
      )}

      <div className="mb-6 max-w-xs">
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="abiertas">Abiertas</option>
          <option value="resueltas">Resueltas</option>
          <option value="todas">Todas</option>
        </Select>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin incidencias.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visibles.map((inc) => (
              <div key={inc.id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                  <div>
                    <strong className="text-sm">{inc.models?.stage_name}</strong>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{TIPOS[inc.tipo]} · {inc.fecha}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ESTADO_COLOR[inc.estado]}22`, color: ESTADO_COLOR[inc.estado] }}>
                    {inc.estado === 'abierta' ? 'Abierta' : 'Resuelta'}
                  </span>
                </div>
                <p className="text-sm mb-2">{inc.descripcion}</p>
                <div className="flex gap-3">
                  <button onClick={() => resolver(inc)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                    {inc.estado === 'abierta' ? 'Marcar resuelta' : 'Reabrir'}
                  </button>
                  <button onClick={() => borrar(inc)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
