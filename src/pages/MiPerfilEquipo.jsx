import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'

const ROLE_LABELS = { admin: 'Administrador', manager: 'Manager de Chatting', chatter: 'Chatter', ig_manager: 'Manager de Instagram', ig_assistant: 'Asistente de Instagram', reddit_manager: 'Manager de Reddit', reddit_assistant: 'Asistente de Reddit', planner: 'Planner', modelo: 'Modelo' }

// Perfil principal de una persona del equipo con acceso acotado (Planner): sus datos y el cambio de contraseña
export default function MiPerfilEquipo() {
  const { profile, session, roles } = useAuth()
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function cambiar(e) {
    e.preventDefault()
    if (pass.length < 8) { setMsg({ ok: false, t: 'La contraseña debe tener al menos 8 caracteres.' }); return }
    if (pass !== pass2) { setMsg({ ok: false, t: 'Las contraseñas no coinciden.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) { setMsg({ ok: false, t: 'No se pudo cambiar: ' + error.message }); return }
    setPass(''); setPass2(''); setMsg({ ok: true, t: 'Contraseña cambiada ✓' })
  }
  const inicial = (profile?.full_name || '?').trim().charAt(0).toUpperCase()
  const lbl = { color: 'var(--text-muted)' }
  return (
    <div>
      <PageHeader title="Mi perfil" subtitle="Tus datos de acceso al CRM." />
      <Panel className="p-5 mb-6">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 26 }}>{inicial}</span>
          <div>
            <p className="text-lg font-medium">{profile?.full_name}</p>
            <p className="text-sm" style={lbl}>{session?.user?.email}</p>
            <p className="text-xs mt-1" style={lbl}>Rol: {roles.map((r) => ROLE_LABELS[r] || r).join(', ')}</p>
          </div>
        </div>
      </Panel>
      <Panel className="p-5 max-w-xl">
        <p className="text-sm font-medium mb-3">Cambiar mi contraseña</p>
        <form onSubmit={cambiar} className="space-y-3">
          <Input type="password" placeholder="Nueva contraseña (mínimo 8 caracteres)" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          <Input type="password" placeholder="Repite la nueva contraseña" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          {msg && <p className="text-sm" style={{ color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.t}</p>}
          <Button type="submit" disabled={busy || !pass}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</Button>
        </form>
      </Panel>
    </div>
  )
}
