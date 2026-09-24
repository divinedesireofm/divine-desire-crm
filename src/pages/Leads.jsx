import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, Select, Table, Td, StatusBadge, PageHeader } from '../components/ui'

const STAGES = ['nuevo', 'contactado', 'en_conversacion', 'negociando', 'firmado', 'descartado']

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', instagram_handle: '', source: '', stage: 'nuevo', notes: '' })
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('recruitment_leads').select('*').order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('recruitment_leads').insert([form])
    if (error) {
      setError('No se pudo guardar el lead.')
      return
    }
    setForm({ name: '', instagram_handle: '', source: '', stage: 'nuevo', notes: '' })
    setShowForm(false)
    load()
  }

  async function updateStage(id, stage) {
    await supabase.from('recruitment_leads').update({ stage }).eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Reclutamiento"
        subtitle="Leads de posibles modelos, desde el primer contacto hasta la firma."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : 'Añadir lead'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              placeholder="@instagram"
              value={form.instagram_handle}
              onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })}
            />
            <Input
              placeholder="Origen (IG orgánico, Ads, referido…)"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </Select>
            <Input
              placeholder="Notas"
              className="col-span-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {error && <p className="col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="col-span-2">Guardar lead</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Nombre', 'Instagram', 'Origen', 'Etapa', 'Notas']}
            rows={leads}
            renderRow={(l) => (
              <>
                <Td>{l.name}</Td>
                <Td>{l.instagram_handle || '—'}</Td>
                <Td>{l.source || '—'}</Td>
                <Td>
                  <select
                    value={l.stage}
                    onChange={(e) => updateStage(l.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {STAGES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                  </select>
                </Td>
                <Td style={{ color: 'var(--text-muted)' }}>{l.notes || '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
