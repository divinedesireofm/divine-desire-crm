import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const CATEGORIAS = ['tutorial', 'plantilla', 'pdf', 'script', 'otro']
const CATEGORIA_LABEL = { tutorial: 'Tutorial', plantilla: 'Plantilla', pdf: 'PDF', script: 'Script', otro: 'Otro' }
const AMBITO_LABEL = { equipo: 'Solo equipo', modelos: 'Solo modelos', todos: 'Todos' }

const EMPTY = { titulo: '', descripcion: '', url: '', categoria: 'tutorial', subcategoria: '', ambito: 'equipo' }

export default function Resources() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [personas, setPersonas] = useState([])
  const [envios, setEnvios] = useState({}) // resource_id -> [ { destinatario_id, visto_en, profiles } ]
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [enviarA, setEnviarA] = useState({}) // resource_id -> persona_id seleccionada

  async function load() {
    setLoading(true)
    const [{ data }, personasLista, { data: enviosData }] = await Promise.all([
      supabase.from('resources').select('*').order('categoria').order('created_at', { ascending: false }),
      getProfilesByRoles(['manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo']),
      supabase.from('resource_sends').select('*, profiles(full_name)'),
    ])
    setRows(data || [])
    setPersonas(personasLista)
    const porRecurso = {}
    ;(enviosData || []).forEach((e) => { (porRecurso[e.resource_id] = porRecurso[e.resource_id] || []).push(e) })
    setEnvios(porRecurso)
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

  async function enviarRecurso(resourceId) {
    const destinatarioId = enviarA[resourceId]
    if (!destinatarioId) return
    await supabase.from('resource_sends').upsert([{ resource_id: resourceId, destinatario_id: destinatarioId }], { onConflict: 'resource_id,destinatario_id' })
    setEnviarA((e) => ({ ...e, [resourceId]: '' }))
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
            <Input placeholder="Subcategoría (opcional)" value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} />
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
            <div className="space-y-4">
              {items.map((r) => (
                <div key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>{r.titulo} ↗</a>
                      ) : (
                        <p className="text-sm font-medium">{r.titulo}</p>
                      )}
                      {r.subcategoria && <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>· {r.subcategoria}</span>}
                      {r.descripcion && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.descripcion}</p>}
                      <span className="text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'var(--panel-alt)', color: 'var(--text-muted)' }}>
                        {AMBITO_LABEL[r.ambito]}
                      </span>
                    </div>
                    {puedeGestionar && (
                      <button onClick={() => borrar(r)} className="text-xs hover:underline shrink-0" style={{ color: 'var(--danger)' }}>Borrar</button>
                    )}
                  </div>

                  {puedeGestionar && (
                    <div className="mt-2 flex gap-2 items-center flex-wrap">
                      <Select value={enviarA[r.id] || ''} onChange={(e) => setEnviarA((s) => ({ ...s, [r.id]: e.target.value }))} className="max-w-[200px]">
                        <option value="">Enviar a…</option>
                        {personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </Select>
                      <button onClick={() => enviarRecurso(r.id)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Marcar enviado</button>
                      {(envios[r.id] || []).length > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Enviado a: {envios[r.id].map((e) => `${e.profiles?.full_name}${e.visto_en ? ' ✓' : ''}`).join(', ')}
                        </span>
                      )}
                    </div>
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
