import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, StatusBadge, PageHeader } from '../components/ui'

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', chatter: 'Chatter', ig_assistant: 'Asistente IG', ig_manager: 'Manager IG' }

// Qué roles puede VER cada tipo de manager en su listado de equipo
function rolesVisibles(role) {
  if (role === 'admin') return ['manager', 'chatter', 'ig_manager', 'ig_assistant']
  if (role === 'manager') return ['manager', 'chatter']
  if (role === 'ig_manager') return ['ig_manager', 'ig_assistant']
  return []
}
// Qué rol puede CREAR cada tipo de manager, y con qué rol se sugiere por defecto
function rolesCreables(role) {
  if (role === 'admin') return [['manager', 'Manager'], ['ig_manager', 'Manager de Instagram'], ['chatter', 'Chatter'], ['ig_assistant', 'Asistente de Instagram']]
  if (role === 'manager') return [['chatter', 'Chatter']]
  if (role === 'ig_manager') return [['ig_assistant', 'Asistente de Instagram']]
  return []
}
// Qué rol de "subordinado directo" puede este manager activar/desactivar
function puedeTogglear(role, targetRole) {
  if (role === 'admin') return true
  if (role === 'manager') return targetRole === 'chatter'
  if (role === 'ig_manager') return targetRole === 'ig_assistant'
  return false
}

export default function Team() {
  const { profile, role } = useAuth()
  const visibles = rolesVisibles(role)
  const creables = rolesCreables(role)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(null)
  const [resetU, setResetU] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').in('role', visibles).order('role').order('full_name')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleActivo(u) {
    if (u.id === profile.id) { alert('No puedes desactivar tu propia cuenta.'); return }
    await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Equipo"
        subtitle={role === 'admin' ? 'Crea managers y chatters, y gestiona accesos.' : 'Crea y gestiona a tu equipo.'}
        action={creables.length > 0 && (
          <Button onClick={() => setEdit({ email: '', full_name: '', role: creables[0][0], password: '' })}>+ Nuevo usuario</Button>
        )}
      />

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin miembros de equipo todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nombre', 'Rol', 'Estado', ''].map((c) => (
                  <th key={c} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3"><strong>{u.full_name}</strong></td>
                  <td className="px-4 py-3">{ROLE_LABEL[u.role] || u.role}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.active ? 'activa' : 'baja'} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setResetU(u)} className="text-xs hover:underline mr-3" style={{ color: 'var(--accent)' }}>Resetear contraseña</button>
                    {puedeTogglear(role, u.role) && u.id !== profile.id && (
                      <button onClick={() => toggleActivo(u)} className="text-xs hover:underline" style={{ color: u.active ? 'var(--danger)' : 'var(--success)' }}>
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {edit && (
        <NuevoUsuarioModal
          opciones={creables}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); load() }}
        />
      )}
      {resetU && <ResetModal u={resetU} onClose={() => setResetU(null)} />}
    </div>
  )
}

function NuevoUsuarioModal({ opciones, onClose, onSaved }) {
  const [f, setF] = useState({ email: '', full_name: '', role: opciones[0]?.[0] || '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(null)

  async function guardar() {
    if (!f.email.trim() || !f.full_name.trim()) { setErr('Completa nombre y email.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('team-admin', {
      body: { action: 'create', email: f.email.trim(), full_name: f.full_name.trim(), role: f.role, password: f.password || undefined },
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data?.error) { setErr(data.error); return }
    setOk(data.tempPassword)
  }

  return (
    <Panel className="p-5 mt-4">
      <p className="text-sm font-medium mb-3">Nuevo usuario</p>
      {ok ? (
        <div>
          <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>
            Cuenta creada ✓. Comunícale a <strong>{f.full_name}</strong> su email y esta contraseña: <strong>{ok}</strong>
          </p>
          <Button onClick={onSaved}>Listo</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input placeholder="Nombre" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            <Input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {opciones.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </Select>
            <Input placeholder="Contraseña (opcional)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Si dejas la contraseña vacía, se asignará una por defecto que verás al guardar.
          </p>
          {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex gap-2">
            <Button onClick={guardar} disabled={busy}>{busy ? 'Creando…' : 'Guardar'}</Button>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </>
      )}
    </Panel>
  )
}

function ResetModal({ u, onClose }) {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  async function guardar() {
    if (pass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('team-admin', {
      body: { action: 'reset', user_id: u.id, password: pass },
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data?.error) { setErr(data.error); return }
    setOk(true)
  }

  return (
    <Panel className="p-5 mt-4">
      <p className="text-sm font-medium mb-3">Resetear contraseña · {u.full_name}</p>
      {ok ? (
        <div>
          <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>
            Contraseña actualizada ✓. Comunícasela a <strong>{u.full_name}</strong>: <strong>{pass}</strong>
          </p>
          <Button onClick={onClose}>Listo</Button>
        </div>
      ) : (
        <>
          <Input placeholder="Nueva contraseña (mínimo 6 caracteres)" value={pass} onChange={(e) => setPass(e.target.value)} className="mb-3" />
          {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex gap-2">
            <Button onClick={guardar} disabled={busy}>{busy ? 'Reseteando…' : 'Resetear'}</Button>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </>
      )}
    </Panel>
  )
}
