import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const CATEGORIAS = ['rol', 'pregunta_fan', 'chiste_texto', 'cuerpo_estetica', 'romantico', 'humor_remate', 'otro']
const CATEGORIA_LABEL = { rol: 'Rol / personaje', pregunta_fan: 'Responde pregunta de fan', chiste_texto: 'Chiste de texto', cuerpo_estetica: 'Cuerpo y estética', romantico: 'Conexión romántica', humor_remate: 'Humor con remate', otro: 'Otro' }
const EMPTY = { titulo: '', url: '', categoria: '', notas: '' }

export default function ReferenceReels() {
  const { profile, hasAnyRole } = useAuth()
  const puedeBorrar = hasAnyRole(['admin', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('reference_reels').select('*').order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!form.titulo.trim()) { setError('Ponle un título.'); return }
    await supabase.from('reference_reels').insert([{ ...form, titulo: form.titulo.trim(), creado_por: profile.id }])
    setForm(EMPTY)
    setShowForm(false)
    load()
  }

  async function borrar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"?`)) return
    await supabase.from('reference_reels').delete().eq('id', r.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Reels de referencia"
        subtitle="Biblioteca de inspiración: reels que veis fuera y queréis tener como referencia."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir reel'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Título / descripción" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Input placeholder="Enlace al reel" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="">Formato…</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </Select>
            <Input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="sm:col-span-2">Guardar</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin reels de referencia guardados todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {rows.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-3">
                <div>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>{r.titulo} ↗</a>
                  ) : (
                    <p className="text-sm font-medium">{r.titulo}</p>
                  )}
                  {r.notas && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.notas}</p>}
                  {r.categoria && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'var(--panel-alt)', color: 'var(--text-muted)' }}>
                      {CATEGORIA_LABEL[r.categoria]}
                    </span>
                  )}
                </div>
                {puedeBorrar && (
                  <button onClick={() => borrar(r)} className="text-xs hover:underline shrink-0" style={{ color: 'var(--danger)' }}>Borrar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
