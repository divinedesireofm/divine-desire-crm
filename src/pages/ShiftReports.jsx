import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, PageHeader } from '../components/ui'

export default function ShiftReports() {
  const { profile, role } = useAuth()
  const isSupervisor = role === 'admin' || role === 'manager'
  const [reports, setReports] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ model_id: '', resumen: '', ventas: '', incidencias: '' })
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: reps }, { data: mods }] = await Promise.all([
      supabase.from('shift_reports').select('*, models(stage_name), profiles(full_name)').order('created_at', { ascending: false }),
      supabase.from('models').select('id, stage_name'),
    ])
    setReports(reps || [])
    setModels(mods || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('shift_reports').insert([{
      chatter_id: profile.id,
      model_id: form.model_id,
      resumen: form.resumen,
      ventas: form.ventas || null,
      incidencias: form.incidencias || null,
    }])
    if (error) { setError('No se pudo guardar el reporte.'); return }
    setForm({ model_id: '', resumen: '', ventas: '', incidencias: '' })
    setShowForm(false)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Reportes de turno"
        subtitle="Al final de tu turno, reporta cómo fue con cada modelo que llevaste."
        action={!isSupervisor && (
          <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : 'Nuevo reporte'}</Button>
        )}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} required>
              <option value="">Elige modelo</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Input
              type="number" step="0.01"
              placeholder="Ventas del turno (€, opcional)"
              value={form.ventas}
              onChange={(e) => setForm({ ...form, ventas: e.target.value })}
            />
            <Input
              placeholder="Cómo fue el turno"
              className="col-span-2"
              value={form.resumen}
              onChange={(e) => setForm({ ...form, resumen: e.target.value })}
              required
            />
            <Input
              placeholder="Incidencias (opcional)"
              className="col-span-2"
              value={form.incidencias}
              onChange={(e) => setForm({ ...form, incidencias: e.target.value })}
            />
            {error && <p className="col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="col-span-2">Guardar reporte</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Chatter', 'Modelo', 'Ventas', 'Resumen', 'Incidencias']}
            rows={reports}
            renderRow={(r) => (
              <>
                <Td>{r.profiles?.full_name}</Td>
                <Td>{r.models?.stage_name}</Td>
                <Td>{r.ventas ? `${r.ventas} €` : '—'}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{r.resumen}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{r.incidencias || '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
