import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { fmtMoney } from '../lib/pagos'

function fmtFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export default function Sanctions() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [fChatter, setFChatter] = useState('todos')
  const [form, setForm] = useState({ chatter_id: '', motivo: '', monto: '', fecha: fechaHoyISO() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [nameMap, setNameMap] = useState({})

  async function load() {
    const [{ data: s }, { data: u }, { data: all }] = await Promise.all([
      supabase.from('sanctions').select('*, profiles(full_name)').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(400),
      supabase.from('profiles').select('id, full_name, role').in('role', ['manager', 'chatter']).order('full_name'),
      supabase.from('profiles').select('id, full_name'),
    ])
    setRows(s || [])
    setUsers(u || [])
    const map = {}
    ;(all || []).forEach((p) => { map[p.id] = p.full_name })
    setNameMap(map)
    setForm((f) => f.chatter_id ? f : { ...f, chatter_id: u?.[0]?.id || '' })
  }

  useEffect(() => { load() }, [])

  async function crear() {
    setError(null)
    if (!form.chatter_id) { setError('Selecciona un chatter.'); return }
    if (!form.motivo.trim()) { setError('Indica el motivo de la sanción.'); return }
    setBusy(true)
    const { error } = await supabase.from('sanctions').insert([{
      chatter_id: form.chatter_id,
      motivo: form.motivo.trim(),
      monto: parseFloat(form.monto) || 0,
      fecha: form.fecha,
      creado_por: profile.id,
    }])
    if (error) { setError('No se pudo registrar.'); setBusy(false); return }
    setForm((f) => ({ ...f, motivo: '', monto: '' }))
    await load()
    setBusy(false)
  }

  async function borrar(s) {
    if (!confirm(`¿Eliminar esta sanción de ${s.profiles?.full_name}?`)) return
    await supabase.from('sanctions').delete().eq('id', s.id)
    load()
  }

  const vis = rows.filter((r) => fChatter === 'todos' ? true : r.chatter_id === fChatter)
  const totalMonto = vis.reduce((a, r) => a + (parseFloat(r.monto) || 0), 0)

  return (
    <div>
      <PageHeader title="Sanciones" subtitle="Registra las sanciones del equipo con su motivo y fecha." />

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">Nueva sanción</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Select value={form.chatter_id} onChange={(e) => setForm({ ...form, chatter_id: e.target.value })}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
          <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          <Input
            type="number" step="0.01" placeholder="Monto (opcional)"
            value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
          />
        </div>
        <textarea
          value={form.motivo}
          onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          placeholder="Describe el motivo de la sanción (qué pasó, cuándo, contexto)..."
          rows={3}
          className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        {error && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        <Button onClick={crear} disabled={busy}>{busy ? 'Guardando…' : 'Registrar sanción'}</Button>
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium">Historial de sanciones</p>
          <Select value={fChatter} onChange={(e) => setFChatter(e.target.value)} className="max-w-[200px]">
            <option value="todos">Todos los chatters</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
        </div>
        {vis.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
            Sin sanciones registradas{fChatter !== 'todos' ? ` para ${nameMap[fChatter] || ''}` : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Chatter', 'Monto', 'Motivo', 'Puesta por', 'Vista', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vis.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(s.fecha)}</td>
                    <td className="px-3 py-2"><strong>{s.profiles?.full_name}</strong></td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.monto ? fmtMoney(s.monto) : '—'}</td>
                    <td className="px-3 py-2" style={{ maxWidth: 340, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{s.motivo}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{nameMap[s.creado_por] || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{ background: s.visto ? 'var(--success)22' : 'var(--gold)22', color: s.visto ? 'var(--success)' : 'var(--gold)' }}
                      >
                        {s.visto ? 'Vista' : 'Sin ver'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => borrar(s)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vis.length > 0 && totalMonto > 0 && (
          <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
            Total en montos {fChatter !== 'todos' ? `de ${nameMap[fChatter] || ''} ` : ''}: <strong style={{ color: 'var(--text)' }}>{fmtMoney(totalMonto)}</strong>
          </p>
        )}
      </Panel>
    </div>
  )
}
