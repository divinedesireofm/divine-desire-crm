import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Td, StatusBadge, PageHeader } from '../components/ui'

const STATUS_OPTIONS = ['calentando', 'activa', 'en_revision', 'suspendida', 'baneada']

const EMPTY_FORM = {
  original_username: '',
  email: '',
  profile_link: '',
  username: '',
  model_id: '',
  target_audience: '',
  bio_link: '',
  status: 'calentando',
  assigned_to: '',
  two_fa_code: '',
  assigned_at: '',
  observations: '',
  restrictions: '',
}

function diasTranscurridos(fecha) {
  if (!fecha) return '—'
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  return dias >= 0 ? dias : '—'
}

export default function InstagramAccounts() {
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'ig_manager' || role === 'ig_assistant'
  const [accounts, setAccounts] = useState([])
  const [models, setModels] = useState([])
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
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

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(a) {
    setEditingId(a.id)
    setForm({
      original_username: a.original_username || '',
      email: a.email || '',
      profile_link: a.profile_link || '',
      username: a.username || '',
      model_id: a.model_id || '',
      target_audience: (a.target_audience || []).join(', '),
      bio_link: a.bio_link || '',
      status: a.status || 'calentando',
      assigned_to: a.assigned_to || '',
      two_fa_code: a.two_fa_code || '',
      assigned_at: a.assigned_at || '',
      observations: a.observations || '',
      restrictions: a.restrictions || '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = {
      original_username: form.original_username || null,
      email: form.email || null,
      profile_link: form.profile_link || null,
      username: form.username,
      model_id: form.model_id || null,
      target_audience: form.target_audience
        ? form.target_audience.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
      bio_link: form.bio_link || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
      two_fa_code: form.two_fa_code || null,
      assigned_at: form.assigned_at || null,
      observations: form.observations || null,
      restrictions: form.restrictions || null,
    }

    const { error } = editingId
      ? await supabase.from('instagram_accounts').update(payload).eq('id', editingId)
      : await supabase.from('instagram_accounts').insert([payload])

    if (error) {
      setError('No se pudo guardar. Comprueba que el usuario no esté ya registrado.')
      return
    }
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Cuentas de Instagram"
        subtitle="Ficha completa de cada cuenta: origen, credenciales, responsable y estado."
        action={canEdit && !editingId && (
          <Button onClick={showForm ? () => setShowForm(false) : startCreate}>
            {showForm ? 'Cancelar' : 'Añadir cuenta'}
          </Button>
        )}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4 font-medium">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</p>
          <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-3">
            <Input
              placeholder="Instagram original (si la cuenta fue comprada)"
              value={form.original_username}
              onChange={(e) => setForm({ ...form, original_username: e.target.value })}
            />
            <Input
              placeholder="Correo de la cuenta"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Link de Instagram"
              value={form.profile_link}
              onChange={(e) => setForm({ ...form, profile_link: e.target.value })}
            />
            <Input
              placeholder="@usuario actual"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
              <option value="">Sin modelo asignado</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Input
              placeholder="Público objetivo (ej: Español, USA)"
              value={form.target_audience}
              onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
            />
            <Input
              placeholder="Link bio"
              value={form.bio_link}
              onChange={(e) => setForm({ ...form, bio_link: e.target.value })}
            />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </Select>
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Sin asistente asignado</option>
              {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </Select>
            <Input
              placeholder="Código 2FA"
              value={form.two_fa_code}
              onChange={(e) => setForm({ ...form, two_fa_code: e.target.value })}
            />
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha de creación/asignación</label>
              <Input
                type="date"
                value={form.assigned_at}
                onChange={(e) => setForm({ ...form, assigned_at: e.target.value })}
              />
            </div>
            <Input
              placeholder="Observaciones"
              className="col-span-1"
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
            />
            <Input
              placeholder="Restricciones"
              className="col-span-1"
              value={form.restrictions}
              onChange={(e) => setForm({ ...form, restrictions: e.target.value })}
            />
            {error && <p className="col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="col-span-3 flex gap-2">
              <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar cuenta'}</Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['IG original', 'Correo', 'Cuenta actual', 'Modelo', 'Público', 'Estado', 'Responsable', '2FA', 'Asignación', 'Días', 'Observaciones', 'Restricciones', ''].map((c) => (
                    <th key={c} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay cuentas.</td></tr>
                ) : accounts.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>{a.original_username || '—'}</Td>
                    <Td style={{ color: 'var(--text-muted)' }}>{a.email || '—'}</Td>
                    <Td>
                      {a.profile_link ? (
                        <a href={a.profile_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@{a.username}</a>
                      ) : `@${a.username}`}
                    </Td>
                    <Td>{a.models?.stage_name || '—'}</Td>
                    <Td>{(a.target_audience || []).join(', ') || '—'}</Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td>{a.profiles?.full_name || '—'}</Td>
                    <Td style={{ color: 'var(--text-muted)' }}>{a.two_fa_code || '—'}</Td>
                    <Td>{a.assigned_at || '—'}</Td>
                    <Td>{diasTranscurridos(a.assigned_at)}</Td>
                    <Td style={{ color: 'var(--text-muted)' }}>{a.observations || '—'}</Td>
                    <Td style={{ color: 'var(--text-muted)' }}>{a.restrictions || '—'}</Td>
                    <Td>
                      {canEdit && (
                        <button onClick={() => startEdit(a)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                          Editar
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
