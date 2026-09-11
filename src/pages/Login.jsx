import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Input, Button } from '../components/ui'
import logo from '../assets/logo.png'

export default function Login() {
  const { deactivatedMsg } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Panel className="w-full max-w-sm p-8 text-center">
        <img src={logo} alt="Divine Desire" className="h-28 mx-auto mb-3 object-contain" />
        <div className="h-px w-24 mx-auto mb-5" style={{ background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Entra con tu cuenta para acceder al panel.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {deactivatedMsg && <p className="text-sm" style={{ color: 'var(--danger)' }}>{deactivatedMsg}</p>}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Panel>
    </div>
  )
}
