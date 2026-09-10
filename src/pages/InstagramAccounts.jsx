import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, StatusBadge, PageHeader } from '../components/ui'

const STATUS_OPTIONS = ['calentando', 'activa', 'en_revision', 'suspendida', 'baneada']

export default function InstagramAccounts() {
  const { role } = useAuth()
  const canCreate = role === 'admin'
  const [accounts, setAccounts] = useState([])
  const [models, setModels] = useState([])
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', status: 'calentando', model_id: '', assigned_to: '' })
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: acc }, { data: mods }, { data: profs }] = await Promise.all([
      supabase.from('instagram_accounts').select('*, models(stage_name), profiles(full_name)').order('created_at', { ascending: false }),
      supabase.from('models').select('id, stage_name'),
      supabase.from('profiles').select('id, full_name').eq('role', 'ig_assistant'),
    ])
    setAccounts(acc || [])
    setModels(mods || [])
    setAssistants(profs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('instagram_accounts').insert([{
      username: form.username,
      status: form.status,
      model_id: form.model_id || null,
      assigned_to: form.assigned_to || null,
    }])
    if (error) {
      setError('No se pudo guardar. Comprueba que el usuario no esté ya registrado.')
      return
    }
    setForm({ username: '', status: 'calentando', model_id: '', assigned_to: '' })
    setShowForm(false)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Cuentas de Instagram"
        subtitle="Estado de cada cuenta y quién del equipo la lleva."
        action={canCreate && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : 'Añadir cuenta'}
          </Button>
        )}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <Input
              placeholder="@usuario de Instagram"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </Select>
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
              <option value="">Sin modelo asignado</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Sin asistente asignado</option>
              {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </Select>
            {error && <p className="col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="col-span-2">Guardar cuenta</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Cuenta', 'Estado', 'Modelo', 'Responsable', 'Último incidente']}
            rows={accounts}
            renderRow={(a) => (
              <>
                <Td>@{a.username}</Td>
                <Td><StatusBadge status={a.status} /></Td>
                <Td>{a.models?.stage_name || '—'}</Td>
                <Td>{a.profiles?.full_name || '—'}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{a.last_incident || '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
