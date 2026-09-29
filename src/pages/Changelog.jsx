import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

function fmtFecha(ts) { return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) }

export default function Changelog() {
  const { profile, hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [leidas, setLeidas] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '' })

  async function load() {
    setLoading(true)
    const [{ data: entries }, { data: reads }] = await Promise.all([
      supabase.from('changelog_entries').select('*').order('created_at', { ascending: false }),
      supabase.from('changelog_reads').select('entry_id').eq('usuario_id', profile.id),
    ])
    setRows(entries || [])
    setLeidas(new Set((reads || []).map((r) => r.entry_id)))
    setLoading(false)
    // Marca como leídas todas las que se están viendo ahora
    const nuevasNoLeidas = (entries || []).filter((e) => !(reads || []).some((r) => r.entry_id === e.id))
    if (nuevasNoLeidas.length) {
      await supabase.from('changelog_reads').insert(nuevasNoLeidas.map((e) => ({ usuario_id: profile.id, entry_id: e.id })))
    }
  }
  useEffect(() => { load() }, [])

  async function publicar(e) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.descripcion.trim()) return
    await supabase.from('changelog_entries').insert([{ titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), creado_por: profile.id }])
    setForm({ titulo: '', descripcion: '' })
    setShowForm(false)
    load()
  }

  async function borrar(e) {
    if (!confirm(`¿Eliminar "${e.titulo}"?`)) return
    await supabase.from('changelog_entries').delete().eq('id', e.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Novedades"
        subtitle="Qué ha cambiado en el CRM."
        action={hasRole('admin') && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Publicar novedad'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={publicar}>
            <Input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="mb-3" />
            <textarea
              value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Qué ha cambiado..." rows={3}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <Button type="submit">Publicar</Button>
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin novedades publicadas todavía.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((e) => (
            <Panel key={e.id} className="p-5">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-sm font-medium">{e.titulo}</p>
                {hasRole('admin') && <button onClick={() => borrar(e)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>}
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{e.descripcion}</p>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{fmtFecha(e.created_at)}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
