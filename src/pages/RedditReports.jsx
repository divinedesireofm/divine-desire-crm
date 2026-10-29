import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { fmtF } from '../lib/excelImport'

const lbl = { color: 'var(--text-muted)' }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hoy = () => iso(new Date())
const ayer = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d) }
const aNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : null }
const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-ES'))
const VACIO = { account_id: '', comment_karma: '', post_karma: '', antiguedad: '', baneos: '', observaciones: '' }
function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 80, ...props.style }} />
}

export default function RedditReports() {
  const { profile, hasAnyRole } = useAuth()
  const gestiona = hasAnyRole(['admin', 'reddit_manager'])
  const [fecha, setFecha] = useState(hoy())
  const [cuentas, setCuentas] = useState([])
  const [equipo, setEquipo] = useState([])
  const [reportes, setReportes] = useState([])   // del día elegido
  const [form, setForm] = useState({ ...VACIO })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function cargarBase() {
    const [{ data: c, error }, { data: e }] = await Promise.all([
      supabase.from('reddit_accounts').select('*').order('username'),
      supabase.rpc('reddit_equipo'),
    ])
    if (error) setErr(/reddit_accounts/.test(error.message) ? 'Falta ejecutar la migración 68 en Supabase.' : error.message)
    setCuentas(c || []); setEquipo(e || [])
  }
  async function cargarDia() {
    const { data, error } = await supabase.from('reddit_daily_reports').select('*').eq('fecha', fecha).order('created_at')
    if (error) { setErr(error.message); return }
    setReportes(data || [])
  }
  useEffect(() => { cargarBase() }, [])
  useEffect(() => { cargarDia() }, [fecha])

  const cuenta = (id) => cuentas.find((c) => c.id === id)
  const nombre = (id) => equipo.find((x) => x.id === id)?.full_name || '—'
  const elegibles = cuentas.filter((c) => c.activa || c.id === form.account_id)
  const mios = useMemo(() => reportes.filter((r) => r.worker_id === profile?.id), [reportes, profile])

  // Al elegir cuenta (o cambiar de día) se carga lo que ya hubiera reportado hoy esa cuenta para poder corregirlo
  function elegirCuenta(id) {
    const previo = mios.find((r) => r.account_id === id)
    if (previo) setForm({ account_id: id, comment_karma: previo.comment_karma ?? '', post_karma: previo.post_karma ?? '', antiguedad: previo.antiguedad || '', baneos: previo.baneos || '', observaciones: previo.observaciones || '' })
    else setForm({ ...VACIO, account_id: id })
    setMsg('')
  }
  useEffect(() => { if (form.account_id) elegirCuenta(form.account_id) }, [reportes]) // eslint-disable-line

  async function guardar() {
    if (!form.account_id) { setErr('Elige la cuenta con la que operas.'); return }
    if (form.comment_karma === '' && form.post_karma === '') { setErr('Apunta al menos el comment karma o el post karma.'); return }
    setErr(''); setMsg(''); setGuardando(true)
    const { error } = await supabase.rpc('reddit_guardar_reporte', {
      p_fecha: fecha, p_account: form.account_id, p_comment: aNum(form.comment_karma), p_post: aNum(form.post_karma),
      p_antiguedad: form.antiguedad, p_baneos: form.baneos, p_obs: form.observaciones,
    })
    setGuardando(false)
    if (error) { setErr(/guardar_reporte/.test(error.message) && /function/i.test(error.message) ? 'Falta ejecutar la migración 68 en Supabase.' : error.message); return }
    setMsg(`✓ Reporte del ${fmtF(fecha)} guardado y cuenta u/${cuenta(form.account_id)?.username || ''} actualizada.`)
    setForm({ ...VACIO }); cargarDia(); cargarBase()
  }
  async function borrar(r) {
    if (!window.confirm('¿Borrar este reporte?')) return
    const { error } = await supabase.from('reddit_daily_reports').delete().eq('id', r.id)
    if (error) { setErr(error.message); return }
    cargarDia()
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const sel = cuenta(form.account_id)
  const editando = !!mios.find((r) => r.account_id === form.account_id)

  return (
    <div>
      <PageHeader title="Reportes del día" subtitle="Elige el día (también puedes rellenar uno pasado), la cuenta con la que has operado y apunta su estado. La información de la cuenta se actualiza sola en «Cuentas de Reddit»." />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{msg}</p>}

      <Panel className="p-5 mb-6">
        <div className="flex items-end gap-3 flex-wrap mb-4">
          <div>
            <label className="text-xs mb-1 block" style={lbl}>Día del reporte</label>
            <Input type="date" value={fecha} max={hoy()} onChange={(e) => e.target.value && setFecha(e.target.value > hoy() ? hoy() : e.target.value)} style={{ minWidth: 170 }} />
          </div>
          <Button variant="ghost" onClick={() => setFecha(hoy())} disabled={fecha === hoy()}>Hoy</Button>
          <Button variant="ghost" onClick={() => setFecha(ayer())} disabled={fecha === ayer()}>Ayer</Button>
          {fecha !== hoy() && <span className="text-xs pb-2" style={{ color: 'var(--gold)' }}>Estás rellenando un día pasado.</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="sm:col-span-2">
            <label className="text-xs mb-1 block" style={lbl}>Cuenta con la que operas</label>
            <Select value={form.account_id} onChange={(e) => elegirCuenta(e.target.value)}>
              <option value="">— Elige la cuenta —</option>
              {elegibles.map((c) => <option key={c.id} value={c.id}>u/{c.username}{c.activa ? '' : ' (inactiva)'}</option>)}
            </Select>
            {cuentas.length === 0 && <p className="text-xs mt-1" style={lbl}>Aún no hay cuentas registradas. Pídele a tu manager que las añada en «Cuentas de Reddit».</p>}
            {sel && <p className="text-xs mt-1" style={lbl}>Datos actuales de la cuenta: comment karma {fmtN(sel.comment_karma)} · post karma {fmtN(sel.post_karma)} · antigüedad {sel.antiguedad || '—'}{sel.ultimo_reporte_fecha ? ` · último reporte ${fmtF(sel.ultimo_reporte_fecha)}` : ''}</p>}
            {editando && <p className="text-xs mt-1" style={{ color: 'var(--gold)' }}>Ya reportaste esta cuenta este día: al guardar se actualiza ese reporte.</p>}
          </div>
          <div><label className="text-xs mb-1 block" style={lbl}>Comment karma</label><Input inputMode="numeric" value={form.comment_karma} onChange={(e) => set('comment_karma', e.target.value)} placeholder="Ej.: 1250" /></div>
          <div><label className="text-xs mb-1 block" style={lbl}>Post karma</label><Input inputMode="numeric" value={form.post_karma} onChange={(e) => set('post_karma', e.target.value)} placeholder="Ej.: 430" /></div>
          <div className="sm:col-span-2"><label className="text-xs mb-1 block" style={lbl}>Antigüedad de la cuenta</label><Input value={form.antiguedad} onChange={(e) => set('antiguedad', e.target.value)} placeholder="Ej.: 2 años y 3 meses" /></div>
          <div className="sm:col-span-2"><label className="text-xs mb-1 block" style={lbl}>Baneos o suspensiones en la cuenta (déjalo vacío si no ha habido)</label><Area value={form.baneos} onChange={(e) => set('baneos', e.target.value)} placeholder="Qué ha pasado, en qué subreddit, si se ha apelado…" /></div>
          <div className="sm:col-span-2"><label className="text-xs mb-1 block" style={lbl}>Observaciones generales del día</label><Area value={form.observaciones} style={{ minHeight: 120 }} onChange={(e) => set('observaciones', e.target.value)} placeholder="Qué has hecho, qué funciona, problemas, ideas…" /></div>
        </div>
        <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editando ? 'Actualizar reporte' : 'Guardar reporte'}</Button>
      </Panel>

      <p className="text-sm font-medium mb-2">{gestiona ? `Reportes del ${fmtF(fecha)} (todo el equipo)` : `Mis reportes del ${fmtF(fecha)}`}</p>
      {(gestiona ? reportes : mios).length === 0 ? (
        <Panel className="p-6 text-sm text-center" style={lbl}>No hay reportes este día.</Panel>
      ) : (
        <div className="space-y-2">
          {(gestiona ? reportes : mios).map((r) => (
            <Panel key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <p className="text-sm"><strong>u/{cuenta(r.account_id)?.username || '—'}</strong>{gestiona && <span className="ml-2 text-xs" style={lbl}>· {nombre(r.worker_id)}</span>}</p>
                <div className="flex gap-3 text-xs">
                  {r.worker_id === profile?.id && <button className="underline" onClick={() => { elegirCuenta(r.account_id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar</button>}
                  {gestiona && <button className="underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(r)}>Borrar</button>}
                </div>
              </div>
              <p className="text-xs mb-1" style={lbl}>Comment karma {fmtN(r.comment_karma)} · Post karma {fmtN(r.post_karma)} · Antigüedad {r.antiguedad || '—'}</p>
              {r.baneos && <p className="text-sm mb-1" style={{ color: 'var(--gold)' }}>⚠ {r.baneos}</p>}
              {r.observaciones && <p className="text-sm whitespace-pre-wrap">{r.observaciones}</p>}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
