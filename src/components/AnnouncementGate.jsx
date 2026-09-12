import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button } from './ui'

function scopesFor(roles) {
  const s = new Set(['general'])
  if (roles.includes('admin') || roles.includes('manager') || roles.includes('chatter')) s.add('chatting')
  if (roles.includes('admin') || roles.includes('ig_manager') || roles.includes('ig_assistant')) s.add('instagram')
  return Array.from(s)
}

const AMBITO_LABEL = { general: 'General', chatting: 'Chatting', instagram: 'Instagram' }

function fmtFecha(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AnnouncementGate({ children }) {
  const { profile, roles } = useAuth()
  const [checking, setChecking] = useState(true)
  const [pendientes, setPendientes] = useState([])
  const [busy, setBusy] = useState(false)

  async function check() {
    setChecking(true)
    const scopes = scopesFor(roles)
    const [{ data: anuncios }, { data: leidos }] = await Promise.all([
      supabase.from('announcements').select('*').in('ambito', scopes).order('fijado', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('announcement_reads').select('announcement_id').eq('usuario_id', profile.id),
    ])
    const leidosIds = new Set((leidos || []).map((r) => r.announcement_id))
    setPendientes((anuncios || []).filter((a) => !leidosIds.has(a.id)))
    setChecking(false)
  }

  useEffect(() => { if (profile) check() }, [profile])

  async function continuar() {
    setBusy(true)
    await supabase.from('announcement_reads').insert(
      pendientes.map((a) => ({ announcement_id: a.id, usuario_id: profile.id }))
    )
    setPendientes([])
    setBusy(false)
  }

  if (checking || !profile) return children
  if (pendientes.length === 0) return children

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <p className="text-xs uppercase tracking-wide mb-2 text-center" style={{ color: 'var(--gold)' }}>Antes de empezar</p>
        <h1 className="text-xl font-display font-semibold mb-6 text-center">
          Tienes {pendientes.length} anuncio{pendientes.length > 1 ? 's' : ''} sin leer
        </h1>
        <div className="space-y-3 mb-6 max-h-[55vh] overflow-y-auto">
          {pendientes.map((a) => (
            <Panel key={a.id} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {a.fijado && <span style={{ color: 'var(--gold)' }}>📌</span>}
                <p className="font-medium">{a.titulo}</p>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {AMBITO_LABEL[a.ambito]}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: 'var(--text-muted)' }}>{a.texto}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtFecha(a.created_at)}</p>
            </Panel>
          ))}
        </div>
        <Button onClick={continuar} disabled={busy} className="w-full">
          {busy ? 'Confirmando…' : 'Ya los he leído — continuar'}
        </Button>
      </div>
    </div>
  )
}
