import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, StatusBadge, PageHeader } from '../components/ui'
import { ModelAvatar } from '../components/ModelAvatar'
import { reducirImagen, refrescarFotosModelos } from '../lib/modelPhotos'

const STATUS_OPTIONS = ['en_preparacion', 'activa', 'pausada', 'baja']
const STATUS_LABELS = { en_preparacion: 'En preparación', activa: 'Activa', pausada: 'Pausada', en_negociacion: 'En negociación', baja: 'Baja' }
const EMPTY_FORM = { stage_name: '', status: 'en_preparacion', commission_percent: '', email: '', phone: '', notes: '' }

export default function Models() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [subiendo, setSubiendo] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('models').select('*').order('created_at', { ascending: false })
    if (!error) setModels(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function subirFoto(m, file) {
    if (!file) return
    setError(null); setSubiendo(m.id)
    try {
      const blob = await reducirImagen(file)
      const ruta = `${m.id}-${Date.now()}.jpg`
      const { error: e1 } = await supabase.storage.from('model-photos').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true })
      if (e1) throw e1
      const { data } = supabase.storage.from('model-photos').getPublicUrl(ruta)
      const { error: e2 } = await supabase.from('models').update({ photo_url: data.publicUrl }).eq('id', m.id)
      if (e2) throw e2
      if (m.photo_url) { const vieja = m.photo_url.split('/model-photos/')[1]; if (vieja) supabase.storage.from('model-photos').remove([vieja]) }
      await load(); refrescarFotosModelos()
    } catch (err) {
      setError('No se pudo subir la foto: ' + (err.message || 'inténtalo de nuevo'))
    }
    setSubiendo(null)
  }

  async function quitarFoto(m) {
    if (!confirm(`¿Quitar la foto de ${m.stage_name}?`)) return
    await supabase.from('models').update({ photo_url: null }).eq('id', m.id)
    const vieja = (m.photo_url || '').split('/model-photos/')[1]
    if (vieja) supabase.storage.from('model-photos').remove([vieja])
    await load(); refrescarFotosModelos()
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
      status: !m.status || m.status === 'en_negociacion' ? 'en_preparacion' : m.status,
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
    refrescarFotosModelos()
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
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
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
                <Td>
                  <div className="flex items-center gap-3">
                    {canEdit ? (
                      <label className="cursor-pointer relative group" title={m.photo_url ? 'Cambiar foto' : 'Subir foto'} style={{ opacity: subiendo === m.id ? 0.5 : 1 }}>
                        <ModelAvatar name={m.stage_name} url={m.photo_url || null} size={56} />
                        <input type="file" accept="image/*" className="hidden" disabled={subiendo === m.id} onChange={(e) => { subirFoto(m, e.target.files[0]); e.target.value = '' }} />
                        <span className="absolute -bottom-1 -right-1 text-[10px] leading-none rounded-full px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--accent)', color: '#000' }}>✎</span>
                      </label>
                    ) : <ModelAvatar name={m.stage_name} url={m.photo_url || null} size={56} />}
                    <div>
                      <p>{m.stage_name}</p>
                      {canEdit && (m.photo_url
                        ? <button onClick={() => quitarFoto(m)} className="text-[11px] hover:underline" style={{ color: 'var(--text-muted)' }}>Quitar foto</button>
                        : <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{subiendo === m.id ? 'Subiendo…' : 'Clic en el círculo para añadir foto'}</span>)}
                    </div>
                  </div>
                </Td>
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
    </div>
  )
}
