import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const ESTADOS = ['disponible', 'asignado', 'de_baja']
const ESTADO_LABEL = { disponible: 'Disponible', asignado: 'Asignado', de_baja: 'De baja' }
const ESTADO_COLOR = { disponible: 'var(--success)', asignado: 'var(--accent)', de_baja: 'var(--text-muted)' }
const EMPTY = { proveedor: '', direccion: '', pais: '', dispositivo: '', account_id: '', notas: '' }

export default function Proxies() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('proxies').select('*, instagram_accounts(username)').order('created_at', { ascending: false }),
      supabase.from('instagram_accounts').select('id, username').order('username'),
    ])
    setRows(p || [])
    setCuentas(c || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!form.direccion.trim()) { setError('Indica al menos la dirección/datos de conexión.'); return }
    const estado = form.account_id ? 'asignado' : 'disponible'
    await supabase.from('proxies').insert([{
      ...form, account_id: form.account_id || null, estado, creado_por: profile.id,
    }])
    setForm(EMPTY)
    setShowForm(false)
    load()
  }

  async function asignar(proxy, accountId) {
    await supabase.from('proxies').update({ account_id: accountId || null, estado: accountId ? 'asignado' : 'disponible' }).eq('id', proxy.id)
    load()
  }

  async function darDeBaja(proxy) {
    await supabase.from('proxies').update({ estado: 'de_baja', account_id: null }).eq('id', proxy.id)
    load()
  }

  async function borrar(proxy) {
    if (!confirm('¿Eliminar este proxy?')) return
    await supabase.from('proxies').delete().eq('id', proxy.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Proxies"
        subtitle="Infraestructura anti-detect: qué proxy/dispositivo usa cada cuenta."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir proxy'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder="Proveedor" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
            <Input placeholder="IP:puerto / datos de conexión" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            <Input placeholder="País" value={form.pais} onChange={(e) => setForm({ ...form, pais: e.target.value })} />
            <Input placeholder="Dispositivo asociado" value={form.dispositivo} onChange={(e) => setForm({ ...form, dispositivo: e.target.value })} />
            <Select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Sin asignar todavía</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
            </Select>
            <Input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            {error && <p className="sm:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="sm:col-span-3">Guardar</Button>
          </form>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin proxies registrados todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {rows.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <strong className="text-sm">{p.direccion}</strong>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                    {p.proveedor} {p.pais ? `· ${p.pais}` : ''} {p.dispositivo ? `· ${p.dispositivo}` : ''}
                  </span>
                  {p.notas && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.notas}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ESTADO_COLOR[p.estado]}22`, color: ESTADO_COLOR[p.estado] }}>
                    {ESTADO_LABEL[p.estado]}
                  </span>
                  {p.estado !== 'de_baja' && (
                    <Select value={p.account_id || ''} onChange={(e) => asignar(p, e.target.value)} className="max-w-[160px]">
                      <option value="">Sin asignar</option>
                      {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
                    </Select>
                  )}
                  {p.estado !== 'de_baja' && (
                    <button onClick={() => darDeBaja(p)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Dar de baja</button>
                  )}
                  <button onClick={() => borrar(p)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
