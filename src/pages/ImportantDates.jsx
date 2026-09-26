import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

function proximaOcurrencia(fechaISO, recurrente) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const f = new Date(fechaISO + 'T00:00:00')
  if (!recurrente) return f
  const candidata = new Date(hoy.getFullYear(), f.getMonth(), f.getDate())
  if (candidata < hoy) candidata.setFullYear(candidata.getFullYear() + 1)
  return candidata
}
function diasHasta(d) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((d - hoy) / (1000 * 60 * 60 * 24))
}
function fmtFecha(d) { return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }) }

const EMPTY = { titulo: '', fecha: '', recurrente: true, notas: '' }

export default function ImportantDates() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('important_dates').select('*')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.fecha) return
    await supabase.from('important_dates').insert([{ ...form, titulo: form.titulo.trim(), creado_por: profile.id }])
    setForm(EMPTY)
    setShowForm(false)
    load()
  }

  async function borrar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"?`)) return
    await supabase.from('important_dates').delete().eq('id', r.id)
    load()
  }

  const conProxima = rows
    .map((r) => ({ ...r, _proxima: proximaOcurrencia(r.fecha, r.recurrente), _dias: diasHasta(proximaOcurrencia(r.fecha, r.recurrente)) }))
    .sort((a, b) => a._proxima - b._proxima)

  return (
    <div>
      <PageHeader
        title="Fechas importantes"
        subtitle="Cumpleaños y fechas especiales del equipo o de las modelos."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir fecha'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Título (ej: Cumpleaños de Lily)" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.recurrente} onChange={(e) => setForm({ ...form, recurrente: e.target.checked })} />
              Se repite cada año (cumpleaños, aniversario...)
            </label>
            <Input className="sm:col-span-2" placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            <Button type="submit" className="sm:col-span-2">Guardar</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : conProxima.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin fechas guardadas todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {conProxima.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtFecha(r._proxima)}{r.notas ? ` · ${r.notas}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: r._dias <= 7 ? 'var(--danger)22' : 'var(--panel-alt)', color: r._dias <= 7 ? 'var(--danger)' : 'var(--text-muted)' }}
                  >
                    {r._dias === 0 ? '¡Hoy!' : r._dias === 1 ? 'Mañana' : `en ${r._dias} días`}
                  </span>
                  {puedeGestionar && (
                    <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
