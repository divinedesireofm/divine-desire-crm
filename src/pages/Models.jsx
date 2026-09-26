import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, StatusBadge, PageHeader } from '../components/ui'

const STATUS_OPTIONS = ['en_preparacion', 'activa', 'pausada', 'en_negociacion', 'baja']
const STATUS_LABELS = { en_preparacion: 'En preparación', activa: 'Activa', pausada: 'Pausada', en_negociacion: 'En negociación', baja: 'Baja' }
const EMPTY_FORM = { stage_name: '', status: 'en_preparacion', commission_percent: '', email: '', phone: '', notes: '' }

const PASOS_ONBOARDING = [
  { key: 'contrato', label: 'Firmar contrato' },
  { key: 'cuenta_of', label: 'Crear cuenta de OnlyFans' },
  { key: 'branding', label: 'Definir 4Ps / branding' },
  { key: 'cuentas_ig', label: 'Crear cuentas de Instagram' },
  { key: 'primer_contenido', label: 'Recibir primer lote de contenido' },
  { key: 'primer_reporte', label: 'Primera semana de métricas registrada' },
]

export default function Models() {
  const { hasRole, hasAnyRole } = useAuth()
  const canEdit = hasRole('admin')
  const canOnboard = hasAnyRole(['admin', 'manager'])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [modeloOnboarding, setModeloOnboarding] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('models').select('*').order('created_at', { ascending: false })
    if (!error) {
      setModels(data)
      if (data?.length && !modeloOnboarding) setModeloOnboarding(data[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleOnboarding(modelo, key) {
    const actual = modelo.onboarding || {}
    const nuevo = { ...actual, [key]: actual[key] ? null : new Date().toISOString().slice(0, 10) }
    await supabase.from('models').update({ onboarding: nuevo }).eq('id', modelo.id)
    load()
  }

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(m) {
    setEditingId(m.id)
    setForm({
      stage_name: m.stage_name || '',
      status: m.status || 'en_preparacion',
      commission_percent: m.commission_percent ?? '',
      email: m.email || '',
      phone: m.phone || '',
      notes: m.notes || '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = {
      stage_name: form.stage_name,
      status: form.status,
      commission_percent: form.commission_percent || null,
      email: form.email || null,
      phone: form.phone || null,
      notes: form.notes || null,
    }
    const { error } = editingId
      ? await supabase.from('models').update(payload).eq('id', editingId)
      : await supabase.from('models').insert([payload])

    if (error) {
      setError('No se pudo guardar. Revisa los datos e inténtalo de nuevo.')
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
        title="Modelos"
        subtitle="Ficha de creadoras activas, en negociación o de baja."
        action={canEdit && !editingId && (
          <Button onClick={showForm ? () => setShowForm(false) : startCreate}>
            {showForm ? 'Cancelar' : 'Añadir modelo'}
          </Button>
        )}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4 font-medium">{editingId ? 'Editar modelo' : 'Nuevo modelo'}</p>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Nombre artístico"
              value={form.stage_name}
              onChange={(e) => setForm({ ...form, stage_name: e.target.value })}
              required
            />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
            <Input
              type="number"
              step="0.01"
              placeholder="% comisión agencia"
              value={form.commission_percent}
              onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
            />
            <Input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Teléfono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              placeholder="Notas"
              className="col-span-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {error && <p className="col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="col-span-2 flex gap-2">
              <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar modelo'}</Button>
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
          <Table
            columns={['Nombre', 'Estado', 'Comisión', 'Email', 'Teléfono', 'Notas', '']}
            rows={models}
            renderRow={(m) => (
              <>
                <Td>{m.stage_name}</Td>
                <Td><StatusBadge status={m.status} /></Td>
                <Td>{m.commission_percent ? `${m.commission_percent}%` : '—'}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{m.email || '—'}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{m.phone || '—'}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{m.notes || '—'}</Td>
                <Td>
                  {canEdit && (
                    <button onClick={() => startEdit(m)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                      Editar
                    </button>
                  )}
                </Td>
              </>
            )}
          />
        )}
      </Panel>

      {canOnboard && models.length > 0 && (
        <Panel className="p-5 mt-6">
          <p className="text-sm font-medium mb-3">✅ Onboarding de modelos</p>
          <div className="max-w-xs mb-4">
            <Select value={modeloOnboarding} onChange={(e) => setModeloOnboarding(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
          </div>
          {(() => {
            const m = models.find((x) => x.id === modeloOnboarding)
            if (!m) return null
            const est = m.onboarding || {}
            return (
              <div className="space-y-2">
                {PASOS_ONBOARDING.map((p) => {
                  const hecho = !!est[p.key]
                  return (
                    <label key={p.key} className="flex items-center gap-3 p-2 rounded-md cursor-pointer" style={{ background: 'var(--panel-alt)' }}>
                      <input type="checkbox" checked={hecho} onChange={() => toggleOnboarding(m, p.key)} />
                      <span className="text-sm flex-1" style={{ textDecoration: hecho ? 'line-through' : 'none', color: hecho ? 'var(--text-muted)' : 'var(--text)' }}>
                        {p.label}
                      </span>
                      {hecho && <span className="text-xs" style={{ color: 'var(--success)' }}>{est[p.key]}</span>}
                    </label>
                  )
                })}
              </div>
            )
          })()}
        </Panel>
      )}
    </div>
  )
}
