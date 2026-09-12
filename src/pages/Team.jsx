import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, StatusBadge, PageHeader } from '../components/ui'

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager de Chatting', chatter: 'Chatter', ig_manager: 'Manager de Instagram', ig_assistant: 'Asistente IG' }
const TODOS_LOS_ROLES = ['manager', 'chatter', 'ig_manager', 'ig_assistant']

// Qué roles puede ASIGNAR cada tipo de manager (marcando varias casillas)
function rolesAsignables(roles) {
  if (roles.includes('admin')) return TODOS_LOS_ROLES
  const s = new Set()
  if (roles.includes('manager')) s.add('chatter')
  if (roles.includes('ig_manager')) s.add('ig_assistant')
  return Array.from(s)
}
// Qué filas de la tabla puede VER cada tipo de manager (si el usuario tiene AL MENOS uno de estos roles, se lista)
function rolesVisibles(roles) {
  if (roles.includes('admin')) return TODOS_LOS_ROLES
  const s = new Set()
  if (roles.includes('manager')) { s.add('manager'); s.add('chatter') }
  if (roles.includes('ig_manager')) { s.add('ig_manager'); s.add('ig_assistant') }
  return Array.from(s)
}
// Sobre qué filas puede activar/desactivar y borrar cada tipo de manager
function puedeGestionar(rolesGestor, rolesObjetivo) {
  if (rolesGestor.includes('admin')) return true
  if (rolesGestor.includes('manager') && rolesObjetivo.includes('chatter')) return true
  if (rolesGestor.includes('ig_manager') && rolesObjetivo.includes('ig_assistant')) return true
  return false
}

export default function Team() {
  const { profile, roles } = useAuth()
  const asignables = rolesAsignables(roles)
  const visibles = rolesVisibles(roles)
  const [rows, setRows] = useState([])
  const [rolesPorUsuario, setRolesPorUsuario] = useState({}) // { userId: ['chatter', 'manager'] }
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState(null)
  const [editar, setEditar] = useState(null)
  const [resetU, setResetU] = useState(null)

  async function load() {
    setLoading(true)
    const { data: ur } = await supabase.from('user_roles').select('user_id, role').in('role', visibles)
    const ids = Array.from(new Set((ur || []).map((r) => r.user_id)))
    const byUser = {}
    ;(ur || []).forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r.role) })
    setRolesPorUsuario(byUser)
    if (!ids.length) { setRows([]); setLoading(false); return }
    const { data } = await supabase.from('profiles').select('*').in('id', ids).order('full_name')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleActivo(u) {
    if (u.id === profile.id) { alert('No puedes desactivar tu propia cuenta.'); return }
    await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    load()
  }

  async function borrar(u) {
    if (u.id === profile.id) { alert('No puedes borrarte a ti mismo.'); return }
    if (!confirm(`¿Eliminar definitivamente a ${u.full_name}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.functions.invoke('team-admin', { body: { action: 'delete', user_id: u.id } })
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    load()
  }

  return (
    <div>
      <PageHeader
        title="Equipo"
        subtitle="Gestiona a tu equipo. Cada persona puede tener uno o varios roles a la vez."
        action={asignables.length > 0 && (
          <Button onClick={() => setNuevo({ email: '', full_name: '', roles: [asignables[0]], password: '' })}>+ Nuevo usuario</Button>
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
                {['Nombre', 'Roles', 'Estado', ''].map((c) => (
                  <th key={c} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const rs = rolesPorUsuario[u.id] || [u.role]
                const puede = puedeGestionar(roles, rs)
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3"><strong>{u.full_name}</strong></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rs.map((r) => (
                          <span key={r} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                            {ROLE_LABEL[r] || r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={u.active ? 'activa' : 'baja'} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setResetU(u)} className="text-xs hover:underline mr-3" style={{ color: 'var(--accent)' }}>Contraseña</button>
                      {puede && (
                        <>
                          <button onClick={() => setEditar({ ...u, roles: rs })} className="text-xs hover:underline mr-3" style={{ color: 'var(--accent)' }}>Editar</button>
                          {u.id !== profile.id && (
                            <button onClick={() => toggleActivo(u)} className="text-xs hover:underline mr-3" style={{ color: u.active ? 'var(--danger)' : 'var(--success)' }}>
                              {u.active ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {u.id !== profile.id && (
                            <button onClick={() => borrar(u)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {nuevo && (
        <NuevoUsuarioModal
          form={nuevo} setForm={setNuevo} asignables={asignables}
          onClose={() => setNuevo(null)} onSaved={() => { setNuevo(null); load() }}
        />
      )}
      {editar && (
        <EditarRolesModal
          usuario={editar} asignables={asignables}
          onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load() }}
        />
      )}
      {resetU && <ResetModal u={resetU} onClose={() => setResetU(null)} />}
    </div>
  )
}

function RoleCheckboxes({ asignables, selected, onChange }) {
  function toggle(r) {
    onChange(selected.includes(r) ? selected.filter((x) => x !== r) : selected.concat([r]))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {asignables.map((r) => {
        const on = selected.includes(r)
        return (
          <button
            key={r} type="button" onClick={() => toggle(r)}
            className="px-3 py-1.5 rounded-full text-sm"
            style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
          >
            {ROLE_LABEL[r] || r}
          </button>
        )
      })}
    </div>
  )
}

function NuevoUsuarioModal({ form: f, setForm: setF, asignables, onClose, onSaved }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(null)

  async function guardar() {
    if (!f.email.trim() || !f.full_name.trim()) { setErr('Completa nombre y email.'); return }
    if (!f.roles.length) { setErr('Selecciona al menos un rol.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('team-admin', {
      body: { action: 'create', email: f.email.trim(), full_name: f.full_name.trim(), roles: f.roles, password: f.password || undefined },
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
          </div>
          <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Roles (puedes marcar varios)</label>
          <div className="mb-3">
            <RoleCheckboxes asignables={asignables} selected={f.roles} onChange={(r) => setF({ ...f, roles: r })} />
          </div>
          <Input placeholder="Contraseña (opcional)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mb-3" />
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

function EditarRolesModal({ usuario, asignables, onClose, onSaved }) {
  const [nombre, setNombre] = useState(usuario.full_name)
  const [rolesSel, setRolesSel] = useState(usuario.roles)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function guardar() {
    if (!nombre.trim()) { setErr('El nombre no puede quedar vacío.'); return }
    if (!rolesSel.length) { setErr('Debe tener al menos un rol.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('team-admin', {
      body: { action: 'update_roles', user_id: usuario.id, full_name: nombre.trim(), roles: rolesSel },
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data?.error) { setErr(data.error); return }
    onSaved()
  }

  return (
    <Panel className="p-5 mt-4">
      <p className="text-sm font-medium mb-3">Editar · {usuario.full_name}</p>
      <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="mb-3" />
      <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Roles (puedes marcar varios)</label>
      <div className="mb-3">
        <RoleCheckboxes asignables={asignables} selected={rolesSel} onChange={setRolesSel} />
      </div>
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      <div className="flex gap-2">
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
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
