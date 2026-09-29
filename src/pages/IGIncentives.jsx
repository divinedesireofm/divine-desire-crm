import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const METRICA_LABEL = { seguidores_reel: 'Seguidores ganados por reels (suma)', seguidores_cuenta: 'Seguidores ganados en cuentas de cero (suma)' }
const EMPTY = { nombre: '', metrica: 'seguidores_reel', umbral: '', bono: '' }

function hace30diasISO() { return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) }

export default function IGIncentives() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'ig_manager'])
  const [reglas, setReglas] = useState([])
  const [asistentes, setAsistentes] = useState([])
  const [progreso, setProgreso] = useState({}) // asistente_id -> { seguidores_reel, seguidores_cuenta }
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [desde, setDesde] = useState(hace30diasISO())

  async function loadReglas() {
    const { data } = await supabase.from('ig_incentive_rules').select('*').order('created_at', { ascending: false })
    setReglas(data || [])
  }
  async function loadProgreso() {
    setLoading(true)
    const asis = await getProfilesByRoles(['ig_assistant'])
    setAsistentes(asis)

    const { data: cuentas } = await supabase.from('instagram_accounts').select('id, assigned_to, status')
    const { data: reelsData } = await supabase.from('reels').select('account_id, seguidores_ganados, fecha_publicacion').gte('fecha_publicacion', desde)
    const { data: followerLogs } = await supabase.from('account_followers_log').select('account_id, seguidores, fecha').gte('fecha', desde).order('fecha', { ascending: true })

    const cuentaAsistente = {}
    ;(cuentas || []).forEach((c) => { cuentaAsistente[c.id] = c.assigned_to })

    const result = {}
    asis.forEach((a) => { result[a.id] = { seguidores_reel: 0, seguidores_cuenta: 0 } })

    ;(reelsData || []).forEach((r) => {
      const asistenteId = cuentaAsistente[r.account_id]
      if (asistenteId && result[asistenteId]) result[asistenteId].seguidores_reel += Number(r.seguidores_ganados) || 0
    })

    const primerUltimoPorCuenta = {}
    ;(followerLogs || []).forEach((l) => {
      if (!primerUltimoPorCuenta[l.account_id]) primerUltimoPorCuenta[l.account_id] = { primero: l.seguidores, ultimo: l.seguidores }
      else primerUltimoPorCuenta[l.account_id].ultimo = l.seguidores
    })
    Object.entries(primerUltimoPorCuenta).forEach(([accountId, v]) => {
      const asistenteId = cuentaAsistente[accountId]
      if (asistenteId && result[asistenteId]) result[asistenteId].seguidores_cuenta += Math.max(0, v.ultimo - v.primero)
    })

    setProgreso(result)
    setLoading(false)
  }
  useEffect(() => { loadReglas() }, [])
  useEffect(() => { loadProgreso() }, [desde])

  async function crear(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.umbral || !form.bono) return
    await supabase.from('ig_incentive_rules').insert([{
      nombre: form.nombre.trim(), metrica: form.metrica,
      umbral: parseFloat(form.umbral), bono: parseFloat(form.bono), creado_por: profile.id,
    }])
    setForm(EMPTY)
    setShowForm(false)
    loadReglas()
  }

  async function toggleActiva(r) {
    await supabase.from('ig_incentive_rules').update({ activo: !r.activo }).eq('id', r.id)
    loadReglas()
  }
  async function borrar(r) {
    if (!confirm(`¿Eliminar la regla "${r.nombre}"?`)) return
    await supabase.from('ig_incentive_rules').delete().eq('id', r.id)
    loadReglas()
  }

  const reglasActivas = reglas.filter((r) => r.activo)

  return (
    <div>
      <PageHeader
        title="Incentivos de Instagram"
        subtitle="Reglas de bono ligadas al crecimiento, y quién las está cumpliendo."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Nueva regla'}</Button>}
      />

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Input className="sm:col-span-2" placeholder="Nombre de la regla" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Select value={form.metrica} onChange={(e) => setForm({ ...form, metrica: e.target.value })}>
              {Object.entries(METRICA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input type="number" placeholder="Umbral (ej: 500)" value={form.umbral} onChange={(e) => setForm({ ...form, umbral: e.target.value })} />
            <Input type="number" placeholder="Bono ($)" value={form.bono} onChange={(e) => setForm({ ...form, bono: e.target.value })} />
            <Button type="submit" className="sm:col-span-4">Guardar</Button>
          </form>
        </Panel>
      )}

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-3">Reglas configuradas</p>
        {reglas.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin reglas todavía.</p>
        ) : (
          <div className="space-y-2">
            {reglas.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded-md flex-wrap" style={{ background: 'var(--panel-alt)', opacity: r.activo ? 1 : 0.5 }}>
                <span className="text-sm flex-1">{r.nombre} — {METRICA_LABEL[r.metrica]} ≥ {r.umbral} → ${r.bono}</span>
                {puedeGestionar && (
                  <>
                    <button onClick={() => toggleActiva(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>{r.activo ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mb-4 max-w-xs">
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Progreso desde</label>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : asistentes.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Sin asistentes de Instagram todavía.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {asistentes.map((a) => {
              const p = progreso[a.id] || { seguidores_reel: 0, seguidores_cuenta: 0 }
              const cumplidas = reglasActivas.filter((r) => p[r.metrica] >= r.umbral)
              const totalBono = cumplidas.reduce((s, r) => s + Number(r.bono), 0)
              return (
                <div key={a.id} className="p-4">
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <strong className="text-sm">{a.full_name}</strong>
                    <span className="text-sm" style={{ color: totalBono > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      Bono acumulado: ${totalBono.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Seguidores por reels: {p.seguidores_reel} · Seguidores en cuentas de cero: {p.seguidores_cuenta}
                  </p>
                  {cumplidas.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>✅ Cumple: {cumplidas.map((r) => r.nombre).join(', ')}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
