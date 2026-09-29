import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, StatusBadge, PageHeader } from '../components/ui'

const TIPOS = { restriccion: 'Restricción', baneo: 'Baneo', otro: 'Otro' }
const ESTADOS = ['nueva', 'apelada', 'en_proceso', 'resuelta', 'cancelada']
const ESTADO_LABEL = { nueva: 'Nueva', apelada: 'Apelada', en_proceso: 'En proceso', resuelta: 'Resuelta', cancelada: 'Cancelada' }
const ESTADO_COLOR = { nueva: 'var(--danger)', apelada: 'var(--gold)', en_proceso: 'var(--accent)', resuelta: 'var(--success)', cancelada: 'var(--text-muted)' }

export default function AccountIncidents() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'ig_manager', 'ig_assistant'])
  const [cuentas, setCuentas] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [form, setForm] = useState({ account_id: '', tipo: 'restriccion', notas: '' })
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: inc }] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username').order('username'),
      supabase.from('account_incidents').select('*, instagram_accounts(username)').order('created_at', { ascending: false }),
    ])
    setCuentas(c || [])
    setIncidencias(inc || [])
    if (c?.length && !form.account_id) setForm((f) => ({ ...f, account_id: c[0].id }))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function crear(e) {
    e.preventDefault()
    if (!form.account_id) return
    await supabase.from('account_incidents').insert([{
      account_id: form.account_id, tipo: form.tipo, notas: form.notas || null, creado_por: profile.id,
    }])
    setForm((f) => ({ ...f, notas: '' }))
    setShowForm(false)
    load()
  }

  async function cambiarEstado(inc, nuevoEstado) {
    const payload = { estado: nuevoEstado, updated_at: new Date().toISOString() }
    if (nuevoEstado === 'apelada' && !inc.fecha_apelacion) payload.fecha_apelacion = new Date().toISOString().slice(0, 10)
    await supabase.from('account_incidents').update(payload).eq('id', inc.id)
    load()
  }

  async function borrar(inc) {
    if (!confirm('¿Eliminar esta incidencia?')) return
    await supabase.from('account_incidents').delete().eq('id', inc.id)
    load()
  }

  const visibles = incidencias.filter((i) => filtroEstado === 'todas' || i.estado === filtroEstado)

  return (
    <div>
      <PageHeader
        title="Restricciones y apelaciones"
        subtitle="Seguimiento detallado de incidencias de las cuentas de Instagram."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nueva incidencia'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
            </Select>
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            <Button type="submit" className="sm:col-span-3">Guardar</Button>
          </form>
        </Panel>
      )}

      <div className="mb-6 max-w-xs">
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todas">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
        </Select>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin incidencias registradas.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visibles.map((inc) => (
              <div key={inc.id} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <strong className="text-sm">{inc.instagram_accounts?.username}</strong>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{TIPOS[inc.tipo]} · {inc.fecha_incidencia}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ESTADO_COLOR[inc.estado]}22`, color: ESTADO_COLOR[inc.estado] }}>
                    {ESTADO_LABEL[inc.estado]}
                  </span>
                </div>
                {inc.notas && <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{inc.notas}</p>}
                {inc.fecha_apelacion && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Apelada el {inc.fecha_apelacion}</p>}
                {puedeGestionar && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <Select value={inc.estado} onChange={(e) => cambiarEstado(inc, e.target.value)} className="max-w-[160px]">
                      {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                    </Select>
                    <button onClick={() => borrar(inc)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
