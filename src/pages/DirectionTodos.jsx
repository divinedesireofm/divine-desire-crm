import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

export default function DirectionTodos() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('direction_todos').select('*').order('hecho', { ascending: true }).order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function añadir(e) {
    e.preventDefault()
    if (!nuevo.trim()) return
    await supabase.from('direction_todos').insert([{ titulo: nuevo.trim(), creado_por: profile.id }])
    setNuevo('')
    load()
  }

  async function alternar(t) {
    await supabase.from('direction_todos').update({
      hecho: !t.hecho,
      hecho_en: !t.hecho ? new Date().toISOString().slice(0, 10) : null,
    }).eq('id', t.id)
    load()
  }

  async function borrar(t) {
    await supabase.from('direction_todos').delete().eq('id', t.id)
    load()
  }

  const pendientes = rows.filter((r) => !r.hecho)
  const hechos = rows.filter((r) => r.hecho)

  return (
    <div>
      <PageHeader title="Tareas pendientes" subtitle="Tu propia lista de pendientes como dirección — solo la ves tú." />

      <Panel className="p-5 mb-6">
        <form onSubmit={añadir} className="flex gap-2">
          <Input className="flex-1" placeholder="Añadir una tarea..." value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <Button type="submit">Añadir</Button>
        </form>
      </Panel>

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-3">Pendientes ({pendientes.length})</p>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : pendientes.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nada pendiente. 🎉</p>
        ) : (
          <div className="space-y-2">
            {pendientes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                <input type="checkbox" checked={false} onChange={() => alternar(t)} />
                <span className="text-sm flex-1">{t.titulo}</span>
                <button onClick={() => borrar(t)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {hechos.length > 0 && (
        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">Hechas ({hechos.length})</p>
          <div className="space-y-2">
            {hechos.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-md">
                <input type="checkbox" checked={true} onChange={() => alternar(t)} />
                <span className="text-sm flex-1" style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{t.titulo}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.hecho_en}</span>
                <button onClick={() => borrar(t)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
