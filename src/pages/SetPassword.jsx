import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input } from '../components/ui'
import logo from '../assets/logo.png'

export default function SetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // El enlace del email crea una sesión temporal automáticamente al cargar esta página
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true) })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirmar) { setError('Las dos contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError('No se pudo guardar: ' + error.message); setBusy(false); return }
    // Marca en el perfil que ya se ha configurado la contraseña (para que deje de verse "Pendiente")
    await supabase.functions.invoke('team-admin', { body: { action: 'mark_password_set' } })
    setOk(true)
    // Cierra esta sesión temporal del enlace y manda a la pantalla normal de login,
    // para que entre ya con su contraseña recién creada como haría cualquier otra vez.
    await supabase.auth.signOut()
    setBusy(false)
    setTimeout(() => navigate('/login'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Panel className="p-8 w-full max-w-sm text-center">
        <img src={logo} alt="Divine Desire" className="h-20 object-contain mx-auto mb-6" />
        {!ready ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Comprobando el enlace…</p>
        ) : ok ? (
          <p className="text-sm" style={{ color: 'var(--success)' }}>Contraseña guardada ✓ Ya puedes iniciar sesión…</p>
        ) : (
          <form onSubmit={guardar} className="space-y-3 text-left">
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Crea tu contraseña para entrar al CRM.</p>
            <Input type="password" placeholder="Contraseña nueva" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input type="password" placeholder="Repite la contraseña" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
            {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
          </form>
        )}
      </Panel>
    </div>
  )
}
