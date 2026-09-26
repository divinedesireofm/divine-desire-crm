import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const CATEGORIAS = ['tutorial', 'plantilla', 'pdf', 'script', 'otro']
const CATEGORIA_LABEL = { tutorial: 'Tutorial', plantilla: 'Plantilla', pdf: 'PDF', script: 'Script', otro: 'Otro' }
const AMBITO_LABEL = { equipo: 'Solo equipo', modelos: 'Solo modelos', todos: 'Todos' }

const EMPTY = { titulo: '', descripcion: '', url: '', categoria: 'tutorial', ambito: 'equipo' }

export default function Resources() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('resources').select('*').order('categoria').order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!form.titulo.trim()) { setError('Ponle un título.'); return }
    await supabase.from('resources').insert([{ ...form, titulo: form.titulo.trim(), creado_por: profile.id }])
    setForm(EMPTY)
    setShowForm(false)
    load()
  }

  async function borrar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"?`)) return
    await supabase.from('resources').delete().eq('id', r.id)
    load()
  }

  const porCategoria = {}
  rows.forEach((r) => { (porCategoria[r.categoria] = porCategoria[r.categoria] || []).push(r) })

  return (
    <div>
      <PageHeader
        title="Recursos"
        subtitle="Tutoriales, plantillas y documentos de referencia."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir recurso'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Input placeholder="Enlace (opcional)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </Select>
            <Select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })}>
              {Object.keys(AMBITO_LABEL).map((a) => <option key={a} value={a}>{AMBITO_LABEL[a]}</option>)}
            </Select>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Descripción breve (opcional)"
              rows={2}
              className="sm:col-span-2 w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="sm:col-span-2">Guardar</Button>
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay recursos guardados.</p>
      ) : (
        Object.entries(porCategoria).map(([cat, items]) => (
          <Panel key={cat} className="p-5 mb-4">
            <p className="font-medium mb-3">{CATEGORIA_LABEL[cat] || cat}</p>
            <div className="space-y-3">
              {items.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3">
                  <div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>{r.titulo} ↗</a>
                    ) : (
                      <p className="text-sm font-medium">{r.titulo}</p>
                    )}
                    {r.descripcion && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.descripcion}</p>}
                    <span className="text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'var(--panel-alt)', color: 'var(--text-muted)' }}>
                      {AMBITO_LABEL[r.ambito]}
                    </span>
                  </div>
                  {puedeGestionar && (
                    <button onClick={() => borrar(r)} className="text-xs hover:underline shrink-0" style={{ color: 'var(--danger)' }}>Borrar</button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        ))
      )}
    </div>
  )
}
