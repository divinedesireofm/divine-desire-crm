import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, Select, PageHeader, DeltaBadge } from '../components/ui'

const PASOS_CALENTAMIENTO = [
  { key: 'perfil_completo', label: 'Perfil completo (foto, bio, destacadas)' },
  { key: 'seguridad_2fa', label: '2FA activado y verificación de email/teléfono' },
  { key: 'primera_semana', label: 'Primera semana: máximo 1 publicación al día, sin hashtags de nicho' },
  { key: 'seguir_afines', label: 'Seguir cuentas afines manualmente (20-30/día) la primera semana' },
  { key: 'primeros_100', label: 'Primeros 100 seguidores orgánicos alcanzados' },
  { key: 'reels_regulares', label: 'Publicando reels con regularidad, sin restricciones' },
  { key: 'listo_para_link', label: 'Lista para añadir el link en la destacada' },
]

export default function ZeroAccounts({ embebido = false }) {
  const [cuentas, setCuentas] = useState([])
  const [cuentaId, setCuentaId] = useState('')
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevoConteo, setNuevoConteo] = useState('')

  async function loadCuentas() {
    const { data } = await supabase.from('instagram_accounts').select('*, models(stage_name)').eq('status', 'calentando').order('created_at', { ascending: false })
    setCuentas(data || [])
    if (data?.length && !cuentaId) setCuentaId(data[0].id)
  }
  async function loadLog(id) {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('account_followers_log').select('*').eq('account_id', id).order('fecha', { ascending: true })
    setLog(data || [])
    setLoading(false)
  }
  useEffect(() => { loadCuentas() }, [])
  useEffect(() => { loadLog(cuentaId) }, [cuentaId])

  const cuenta = cuentas.find((c) => c.id === cuentaId)

  async function toggleChecklist(key) {
    if (!cuenta) return
    const actual = cuenta.warmup_checklist || {}
    const nuevo = { ...actual, [key]: actual[key] ? null : new Date().toISOString().slice(0, 10) }
    await supabase.from('instagram_accounts').update({ warmup_checklist: nuevo }).eq('id', cuenta.id)
    loadCuentas()
  }

  async function añadirConteo(e) {
    e.preventDefault()
    if (!nuevoConteo || !cuentaId) return
    await supabase.from('account_followers_log').upsert(
      [{ account_id: cuentaId, fecha: new Date().toISOString().slice(0, 10), seguidores: parseInt(nuevoConteo) }],
      { onConflict: 'account_id,fecha' }
    )
    setNuevoConteo('')
    loadLog(cuentaId)
  }

  const ultimo = log[log.length - 1]
  const anterior = log[log.length - 2]
  const chartData = log.map((l) => ({ fecha: l.fecha, Seguidores: l.seguidores }))

  if (cuentas.length === 0) {
    return (
      <div>
        {!embebido && <PageHeader title="Cuentas de cero" subtitle="Seguimiento especial para cuentas recién creadas, en fase de calentamiento." />}
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No hay ninguna cuenta con estado "Calentando" ahora mismo. Cambia el estado de una cuenta a "Calentando" desde Cuentas de Instagram para que aparezca aquí.
        </p>
      </div>
    )
  }

  return (
    <div>
      {!embebido && <PageHeader title="Cuentas de cero" subtitle="Seguimiento especial para cuentas recién creadas, en fase de calentamiento." />}

      <div className="mb-6 max-w-xs">
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.username} {c.models?.stage_name ? `(${c.models.stage_name})` : ''}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">✅ Checklist de calentamiento</p>
          <div className="space-y-2">
            {PASOS_CALENTAMIENTO.map((p) => {
              const hecho = !!(cuenta?.warmup_checklist || {})[p.key]
              return (
                <label key={p.key} className="flex items-center gap-3 p-2 rounded-md cursor-pointer" style={{ background: 'var(--panel-alt)' }}>
                  <input type="checkbox" checked={hecho} onChange={() => toggleChecklist(p.key)} />
                  <span className="text-sm flex-1" style={{ textDecoration: hecho ? 'line-through' : 'none', color: hecho ? 'var(--text-muted)' : 'var(--text)' }}>
                    {p.label}
                  </span>
                  {hecho && <span className="text-xs" style={{ color: 'var(--success)' }}>{cuenta.warmup_checklist[p.key]}</span>}
                </label>
              )
            })}
          </div>
        </Panel>

        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">📈 Seguidores desde cero</p>
          <form onSubmit={añadirConteo} className="flex gap-2 mb-4">
            <Input type="number" placeholder="Seguidores hoy" value={nuevoConteo} onChange={(e) => setNuevoConteo(e.target.value)} />
            <Button type="submit">Registrar hoy</Button>
          </form>
          {ultimo && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl font-display font-semibold gold-text">{ultimo.seguidores}</span>
              <DeltaBadge actual={ultimo.seguidores} anterior={anterior?.seguidores} />
            </div>
          )}
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          ) : chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="Seguidores" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Registra al menos 2 días para ver la curva de crecimiento.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
