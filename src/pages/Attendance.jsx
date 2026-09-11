import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Select, Input, PageHeader } from '../components/ui'

const TIPOS = {
  entrada: { n: 'Entró', color: 'var(--success)' },
  break: { n: 'Break', color: 'var(--gold)' },
  fin_break: { n: 'Volvió del break', color: 'var(--accent)' },
  salida: { n: 'Salió', color: 'var(--danger)' },
}

function fmtTS(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function Attendance() {
  const { profile } = useAuth()
  const [feed, setFeed] = useState([])
  const [miUltimo, setMiUltimo] = useState(null)
  const [fUser, setFUser] = useState('todos')
  const [fFecha, setFFecha] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(null)

  async function loadMio() {
    const { data } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('chatter_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
    setMiUltimo(data?.[0] || null)
  }

  async function load() {
    let query = supabase
      .from('attendance_events')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (fUser !== 'todos') query = query.eq('chatter_id', fUser)
    if (fFecha) query = query.gte('created_at', `${fFecha}T00:00:00`).lte('created_at', `${fFecha}T23:59:59`)
    const { data } = await query
    setFeed(data || [])
  }

  useEffect(() => { load() }, [fUser, fFecha])
  useEffect(() => { if (profile) loadMio() }, [profile])

  const miEstado = miUltimo?.tipo
  const permitido = !miEstado ? ['entrada']
    : miEstado === 'entrada' ? ['break', 'salida']
    : miEstado === 'break' ? ['fin_break']
    : miEstado === 'fin_break' ? ['break', 'salida']
    : ['entrada'] // salida
  const puede = (t) => busy === '' && permitido.includes(t)

  async function marcar(tipo) {
    setBusy(tipo)
    setError(null)
    const { error } = await supabase.from('attendance_events').insert([{ chatter_id: profile.id, tipo }])
    if (error) setError('No se pudo registrar.')
    await load()
    await loadMio()
    setBusy('')
  }

  const usuariosVistos = useMemo(() => {
    const map = new Map()
    feed.forEach((f) => { if (f.profiles?.full_name) map.set(f.chatter_id, f.profiles.full_name) })
    if (profile) map.set(profile.id, profile.full_name)
    return Array.from(map.entries())
  }, [feed, profile])

  const BOTONES = [
    { tipo: 'entrada', label: 'Entro', sub: 'inicio de jornada', variant: 'primary' },
    { tipo: 'break', label: 'Break', sub: 'pausa comida / personal', variant: 'ghost' },
    { tipo: 'fin_break', label: 'Vuelvo', sub: 'fin del break', variant: 'ghost' },
    { tipo: 'salida', label: 'Salgo', sub: 'fin de jornada', variant: 'danger' },
  ]

  return (
    <div>
      <PageHeader
        title="Entradas y salidas"
        subtitle="Marca tu jornada y tus breaks. Turnos: Madrugada 2:00–10:00 · Mañana 10:00–18:00 · Tarde 18:00–2:00 (hora Venezuela)"
      />

      <Panel className="p-5 mb-6">
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Tu último registro:{' '}
          {miEstado ? <strong style={{ color: 'var(--text)' }}>{TIPOS[miEstado].n} · {fmtTS(miUltimo.created_at)}</strong> : 'sin registros recientes'}
        </p>
        <div className="grid grid-cols-4 gap-3">
          {BOTONES.map((b) => (
            <button
              key={b.tipo}
              disabled={!puede(b.tipo)}
              onClick={() => marcar(b.tipo)}
              className="rounded-lg py-4 text-center transition-opacity disabled:opacity-30 hover:opacity-85"
              style={{
                background: b.variant === 'danger' ? 'transparent' : b.variant === 'ghost' ? 'var(--panel-alt)' : 'var(--accent)',
                border: b.variant === 'danger' ? '1px solid var(--danger)' : '1px solid var(--border)',
                color: b.variant === 'danger' ? 'var(--danger)' : b.variant === 'primary' ? '#0B1020' : 'var(--text)',
              }}
            >
              <div className="font-semibold">{b.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{b.sub}</div>
            </button>
          ))}
        </div>
        {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm font-medium">Registro del equipo</p>
          <div className="flex gap-2">
            <Select value={fUser} onChange={(e) => setFUser(e.target.value)} className="max-w-[180px]">
              <option value="todos">Todos</option>
              {usuariosVistos.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
            <Input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="max-w-[160px]" />
          </div>
        </div>
        {feed.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Sin registros</p>
        ) : (
          <div className="space-y-2">
            {feed.map((f) => (
              <div key={f.id} className="flex items-center gap-3 text-sm py-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TIPOS[f.tipo]?.color }} />
                <strong className="w-32 truncate">{f.profiles?.full_name}</strong>
                <span
                  className="px-2 py-0.5 rounded-full text-xs"
                  style={{ background: `${TIPOS[f.tipo]?.color}22`, color: TIPOS[f.tipo]?.color }}
                >
                  {TIPOS[f.tipo]?.n}
                </span>
                <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{fmtTS(f.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
