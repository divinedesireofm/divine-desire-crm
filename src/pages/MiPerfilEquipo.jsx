import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, PageHeader } from '../components/ui'
import { reducirImagen } from '../lib/modelPhotos'

const ROLE_LABELS = { admin: 'Administrador', manager: 'Manager de Chatting', chatter: 'Chatter', ig_manager: 'Manager de Instagram', ig_assistant: 'Asistente de Instagram', reddit_manager: 'Manager de Reddit', reddit_assistant: 'Asistente de Reddit', planner: 'Planner', masivos: 'Equipo de Masivos', modelo: 'Modelo' }
const lbl = { color: 'var(--text-muted)' }

// «Mi perfil» de cualquier persona del equipo: foto, datos de contacto, información útil y cambio de contraseña.
// Los datos de contacto solo los ve la propia persona y el administrador (lo garantiza la base de datos).
export default function MiPerfilEquipo() {
  const { profile, session, roles, refreshProfile } = useAuth()
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [priv, setPriv] = useState({ email: '', phone: '', notas: '' })
  const [guardando, setGuardando] = useState(false)
  const [msgDatos, setMsgDatos] = useState(null)
  const [foto, setFoto] = useState(profile?.foto_url || '')
  const [subiendo, setSubiendo] = useState(false)
  const [errFoto, setErrFoto] = useState('')

  useEffect(() => {
    if (!profile) return
    supabase.from('team_private').select('email, phone, notas').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => setPriv({ email: data?.email || '', phone: data?.phone || '', notas: data?.notas || '' }))
  }, [profile?.id])

  async function guardarDatos(e) {
    e.preventDefault()
    setGuardando(true); setMsgDatos(null)
    const { error } = await supabase.from('team_private').upsert({
      user_id: profile.id, email: priv.email.trim() || null, phone: priv.phone.trim() || null, notas: priv.notas.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setGuardando(false)
    if (error) { setMsgDatos({ ok: false, t: 'No se pudo guardar: ' + error.message }); return }
    setMsgDatos({ ok: true, t: 'Guardado ✓' })
    setTimeout(() => setMsgDatos(null), 2500)
  }

  async function cambiarFoto(file) {
    if (!file || !profile) return
    setErrFoto(''); setSubiendo(true)
    try {
      const blob = await reducirImagen(file)
      const ruta = `${profile.id}-${Date.now()}.jpg`
      const { error: e1 } = await supabase.storage.from('team-photos').upload(ruta, blob, { contentType: 'image/jpeg' })
      if (e1) throw e1
      const { data } = supabase.storage.from('team-photos').getPublicUrl(ruta)
      const { error: e2 } = await supabase.rpc('cambiar_mi_foto_equipo', { url: data.publicUrl })
      if (e2) throw e2
      const vieja = (foto || '').split('/team-photos/')[1]
      if (vieja) supabase.storage.from('team-photos').remove([vieja])
      setFoto(data.publicUrl)
      refreshProfile && refreshProfile()
    } catch (ex) {
      setErrFoto('No se pudo cambiar la foto: ' + (ex.message || 'inténtalo de nuevo'))
    }
    setSubiendo(false)
  }

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
  return (
    <div>
      <PageHeader title="Mi perfil" subtitle="Tu foto, tus datos de contacto, información útil y tu acceso al CRM." />
      <Panel className="p-5 mb-5">
        <div className="flex items-center gap-5 flex-wrap">
          <label className="relative cursor-pointer shrink-0" title="Cambiar mi foto" style={{ opacity: subiendo ? 0.5 : 1 }}>
            {foto
              ? <img src={foto} alt="Mi foto" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
              : <span aria-hidden="true" style={{ width: 96, height: 96, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 38 }}>{inicial}</span>}
            <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={(e) => { cambiarFoto(e.target.files[0]); e.target.value = '' }} />
            <span className="absolute -bottom-1 -right-1 text-xs leading-none rounded-full px-2 py-1.5" style={{ background: 'var(--accent)', color: '#000' }}>✎</span>
          </label>
          <div>
            <p className="font-display text-2xl font-semibold">{profile?.full_name}</p>
            <p className="text-sm" style={lbl}>{session?.user?.email}</p>
            <p className="text-xs mt-1" style={lbl}>Rol: {roles.map((r) => ROLE_LABELS[r] || r).join(', ')}</p>
            <p className="text-xs mt-1" style={lbl}>{subiendo ? 'Subiendo foto…' : 'Pulsa sobre tu foto para cambiarla.'}</p>
            {errFoto && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{errFoto}</p>}
          </div>
        </div>
      </Panel>

      <Panel className="p-5 mb-5">
        <p className="font-medium mb-1">Mis datos de contacto e información útil</p>
        <p className="text-xs mb-4" style={lbl}>Solo los ven el administrador y tú; el resto del equipo no tiene acceso.</p>
        <form onSubmit={guardarDatos} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={lbl}>Email de contacto</label>
            <Input type="email" value={priv.email} onChange={(e) => setPriv({ ...priv, email: e.target.value })} placeholder="tu@email.com" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={lbl}>Teléfono</label>
            <Input value={priv.phone} onChange={(e) => setPriv({ ...priv, phone: e.target.value })} placeholder="+34 …" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={lbl}>Información útil</label>
            <textarea rows={4} value={priv.notas} onChange={(e) => setPriv({ ...priv, notas: e.target.value })} placeholder="Horarios en los que te localizamos, país, idiomas, cualquier cosa que quieras que sepamos…"
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          {msgDatos && <p className="md:col-span-2 text-sm" style={{ color: msgDatos.ok ? 'var(--success)' : 'var(--danger)' }}>{msgDatos.t}</p>}
          <div className="md:col-span-2"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar mis datos'}</Button></div>
        </form>
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
