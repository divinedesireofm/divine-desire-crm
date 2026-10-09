import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

// ---------- utilidades ----------
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100
const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const OF_NETO = 0.8 // OnlyFans se queda el 20 %: neta = bruta × 80 %

// Misma fórmula que el Excel: (neta × %) + bonos + adelanto + penalización + deuda
export function calcPago(p) {
  return r2(num(p.fact_neta) * num(p.pct) + num(p.bonos) + num(p.adelanto) + num(p.penalizacion) + num(p.deuda))
}

const VACIO = { account_id: '', fecha: hoyISO(), bruta: '', neta: '', pct: '', bonos: '', adelanto: '', penalizacion: '', deuda: '', notas: '', estado: 'Pendiente' }

// ---------- calendario de cobros ----------
// Pago de nómina: un lunes sí y otro no (cada 14 días a partir del último lunes de pago registrado).
// Bonos: los días 1 y 16 de cada mes.
const aDate = (isoStr) => { const [y, m, d] = isoStr.split('-').map(Number); return new Date(y, m - 1, d) }
const aISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const sumarDias = (isoStr, n) => { const d = aDate(isoStr); d.setDate(d.getDate() + n); return aISO(d) }
const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
const DIAS_BONO = [1, 16]
const esDiaBono = (isoStr) => DIAS_BONO.includes(Number(isoStr.slice(8, 10)))
// Fecha ancla: el último lunes con un pago de facturación real (si no hay, cualquier lunes con pago)
function anclaPagos(pagos) {
  const lunes = pagos.filter((p) => aDate(p.fecha).getDay() === 1)
  const reales = lunes.filter((p) => num(p.fact_neta) > 0).map((p) => p.fecha).sort()
  const todos = lunes.map((p) => p.fecha).sort()
  return reales.pop() || todos.pop() || null
}
const esDiaPago = (isoStr, ancla) => !!ancla && difDias(isoStr, ancla) % 14 === 0
function proximoBono(desde) {
  let d = desde
  for (let i = 0; i < 40; i++) { if (esDiaBono(d)) return d; d = sumarDias(d, 1) }
  return desde
}
const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function Payments() {
  const { hasRole } = useAuth()
  return hasRole('admin') ? <PagosAdmin /> : <MisPagos />
}

// =====================================================================================
// ADMIN
// =====================================================================================
function PagosAdmin() {
  const [cuentas, setCuentas] = useState([])
  const [pagos, setPagos] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [sel, setSel] = useState('todas')
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(null)       // formulario de pago (null = cerrado)
  const [editId, setEditId] = useState(null)
  const [cform, setCform] = useState(null)     // formulario de cuenta
  const [msg, setMsg] = useState('')
  const [vista, setVista] = useState('pagos')   // 'pagos' | 'bonos'
  const [bonos, setBonos] = useState([])
  const [sanciones, setSanciones] = useState([])

  async function cargar() {
    const [{ data: c }, { data: p }, { data: pr }, { data: bn }, { data: sn }] = await Promise.all([
      supabase.from('payout_accounts').select('*').order('created_at'),
      supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }).limit(5000),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('payout_bonuses').select('*').order('fecha_cobro', { ascending: false }).limit(2000),
      supabase.from('sanctions').select('id, chatter_id, motivo, monto, fecha, payout_id').order('fecha', { ascending: false }).limit(2000),
    ])
    setCuentas(c || []); setPagos(p || []); setPerfiles(pr || []); setBonos(bn || []); setSanciones(sn || []); setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const visibles = useMemo(() => pagos.filter((p) => sel === 'todas' || p.account_id === sel), [pagos, sel])

  const resumen = useMemo(() => {
    const mes = hoyISO().slice(0, 7)
    const pagados = visibles.filter((p) => p.estado === 'Pagado')
    return {
      total: r2(pagados.reduce((s, p) => s + calcPago(p), 0)),
      mes: r2(pagados.filter((p) => p.fecha.startsWith(mes)).reduce((s, p) => s + calcPago(p), 0)),
      pendiente: r2(visibles.filter((p) => p.estado === 'Pendiente').reduce((s, p) => s + calcPago(p), 0)),
      neta: r2(visibles.reduce((s, p) => s + num(p.fact_neta), 0)),
      n: visibles.length,
    }
  }, [visibles])

  // ---------- pendientes (bonos y sanciones) de una cuenta ----------
  // Bonos: los de la cuenta con fecha de cobro ≤ fecha del pago, aún sin aplicar (o ya enlazados a este pago al editar).
  // Sanciones: las del usuario enlazado a la cuenta con fecha ≤ fecha del pago, sin aplicar (o enlazadas a este pago).
  //   Marcadas por defecto solo las posteriores al último pago de esa cuenta; las anteriores salen desmarcadas
  //   (lo normal es que ya se descontaran a mano en su día).
  function pendientesDe(accountId, fecha, pagoId) {
    const cuenta = cuentaDe(accountId)
    const ultimo = pagos.filter((p) => p.account_id === accountId && p.id !== pagoId && p.fecha < fecha).map((p) => p.fecha).sort().pop() || ''
    const b = bonos.filter((x) => x.account_id === accountId && (x.aplicado_en === pagoId && pagoId ? true : !x.aplicado_en && x.fecha_cobro <= fecha))
    const s = cuenta?.profile_id ? sanciones.filter((x) => x.chatter_id === cuenta.profile_id && ((pagoId && x.payout_id === pagoId) || (!x.payout_id && x.fecha <= fecha))) : []
    return { bonos: b, sanciones: s, ultimo }
  }
  function seleccionPorDefecto(accountId, fecha) {
    const pd = pendientesDe(accountId, fecha, null)
    const selB = pd.bonos.map((x) => x.id)
    const selS = pd.sanciones.filter((x) => !pd.ultimo || x.fecha > pd.ultimo).map((x) => x.id)
    const sumB = r2(pd.bonos.filter((x) => selB.includes(x.id)).reduce((t, x) => t + num(x.monto), 0))
    const sumS = r2(pd.sanciones.filter((x) => selS.includes(x.id)).reduce((t, x) => t + num(x.monto), 0))
    return { selB, selS, bonos: sumB || '', penalizacion: sumS || '' }
  }

  // ---------- pago ----------
  function nuevoPago(fechaIni, cuentaId) {
    const c = cuentaId ? cuentaDe(cuentaId) : sel !== 'todas' ? cuentaDe(sel) : cuentas.find((x) => x.activa !== false) || cuentas[0]
    const fecha = fechaIni || hoyISO()
    setEditId(null)
    setForm({ ...VACIO, fecha, account_id: c?.id || '', pct: c?.pct_defecto ?? 0.15, ...(c ? seleccionPorDefecto(c.id, fecha) : { selB: [], selS: [] }) })
    setVista('pagos')
  }
  function editarPago(p) {
    setEditId(p.id)
    setForm({
      account_id: p.account_id, fecha: p.fecha, bruta: p.fact_bruta ?? '', neta: p.fact_neta ?? '', pct: p.pct ?? '',
      bonos: p.bonos || '', adelanto: p.adelanto || '', penalizacion: Math.abs(num(p.penalizacion)) || '', deuda: Math.abs(num(p.deuda)) || '',
      notas: p.notas || '', estado: p.estado,
      selB: bonos.filter((x) => x.aplicado_en === p.id).map((x) => x.id),
      selS: sanciones.filter((x) => x.payout_id === p.id).map((x) => x.id),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function setF(patch) { setForm((f) => ({ ...f, ...patch })) }
  function alCambiarBruta(v) { setF({ bruta: v, neta: v === '' ? '' : r2(num(v) * OF_NETO) }) }
  function alCambiarNeta(v) { setF({ neta: v, bruta: v === '' ? '' : r2(num(v) / OF_NETO) }) }
  function alCambiarCuenta(id) {
    const c = cuentaDe(id)
    setF({ account_id: id, pct: c?.pct_defecto ?? form.pct, ...(editId ? { selB: [], selS: [] } : seleccionPorDefecto(id, form.fecha)) })
  }
  function alCambiarFecha(fecha) {
    setF({ fecha, ...(editId ? {} : seleccionPorDefecto(form.account_id, fecha)) })
  }
  // Al marcar/desmarcar un bono o sanción, el importe se suma/resta del campo correspondiente
  function alternarBono(b) {
    const on = form.selB.includes(b.id)
    setF({ selB: on ? form.selB.filter((i) => i !== b.id) : [...form.selB, b.id], bonos: r2(num(form.bonos) + (on ? -1 : 1) * num(b.monto)) || '' })
  }
  function alternarSancion(x) {
    const on = form.selS.includes(x.id)
    setF({ selS: on ? form.selS.filter((i) => i !== x.id) : [...form.selS, x.id], penalizacion: r2(Math.max(0, num(form.penalizacion) + (on ? -1 : 1) * num(x.monto))) || '' })
  }

  const previo = form ? calcPago({ fact_neta: form.neta, pct: form.pct, bonos: form.bonos, adelanto: form.adelanto, penalizacion: -Math.abs(num(form.penalizacion)), deuda: -Math.abs(num(form.deuda)) }) : 0

  async function guardarPago(e) {
    e.preventDefault()
    if (!form.account_id || !form.fecha) return
    const payload = {
      account_id: form.account_id, fecha: form.fecha,
      fact_bruta: form.bruta === '' ? null : num(form.bruta), fact_neta: form.neta === '' ? null : num(form.neta),
      pct: form.pct === '' ? null : num(form.pct), bonos: num(form.bonos), adelanto: num(form.adelanto),
      penalizacion: -Math.abs(num(form.penalizacion)), deuda: -Math.abs(num(form.deuda)),
      notas: form.notas.trim() || null, estado: form.estado,
    }
    const { data: guardado, error } = editId
      ? await supabase.from('chatter_payouts').update(payload).eq('id', editId).select().single()
      : await supabase.from('chatter_payouts').insert([payload]).select().single()
    if (error) { setMsg(error.code === '23505' ? 'Ya existe un pago de esa cuenta en esa fecha. Edítalo o cambia la fecha.' : 'No se pudo guardar: ' + error.message); return }
    // enlaces: libera lo que antes estaba en este pago y ya no está marcado, y enlaza lo marcado
    const pid = guardado.id
    const prevB = bonos.filter((x) => x.aplicado_en === pid).map((x) => x.id)
    const prevS = sanciones.filter((x) => x.payout_id === pid).map((x) => x.id)
    const quitarB = prevB.filter((i) => !form.selB.includes(i)); const quitarS = prevS.filter((i) => !form.selS.includes(i))
    const ops = []
    if (quitarB.length) ops.push(supabase.from('payout_bonuses').update({ aplicado_en: null }).in('id', quitarB))
    if (quitarS.length) ops.push(supabase.from('sanctions').update({ payout_id: null }).in('id', quitarS))
    if (form.selB.length) ops.push(supabase.from('payout_bonuses').update({ aplicado_en: pid }).in('id', form.selB))
    if (form.selS.length) ops.push(supabase.from('sanctions').update({ payout_id: pid }).in('id', form.selS))
    const res = await Promise.all(ops)
    if (res.some((r) => r.error)) setMsg('El pago se guardó, pero no se pudieron enlazar algunos bonos/sanciones: ' + res.find((r) => r.error).error.message)
    else setMsg('')
    setForm(null); setEditId(null); cargar()
  }
  async function borrarPago(p) {
    if (!confirm(`¿Eliminar el pago de ${cuentaDe(p.account_id)?.nombre} del ${fmtF(p.fecha)}?`)) return
    await supabase.from('chatter_payouts').delete().eq('id', p.id); cargar()
  }
  async function marcarPagado(p) {
    await supabase.from('chatter_payouts').update({ estado: 'Pagado' }).eq('id', p.id); cargar()
  }

  // ---------- cuenta ----------
  function editarCuenta(c) {
    setCform(c ? { ...c, pct_defecto: c.pct_defecto ?? 0.15, profile_id: c.profile_id || '' }
      : { nombre: '', profile_id: '', fecha_inicio: hoyISO(), pct_defecto: 0.15, wallet_usdc_eth: '', wallet_usdc_bsc: '', wallet_usdt_bsc: '', wallet_binance: '', activa: true })
  }
  async function guardarCuenta(e) {
    e.preventDefault()
    const payload = {
      nombre: cform.nombre.trim(), profile_id: cform.profile_id || null, fecha_inicio: cform.fecha_inicio || null,
      pct_defecto: num(cform.pct_defecto), wallet_usdc_eth: cform.wallet_usdc_eth?.trim() || null, wallet_usdc_bsc: cform.wallet_usdc_bsc?.trim() || null,
      wallet_usdt_bsc: cform.wallet_usdt_bsc?.trim() || null, wallet_binance: cform.wallet_binance?.trim() || null, activa: cform.activa,
    }
    if (!payload.nombre) return
    const { error } = cform.id
      ? await supabase.from('payout_accounts').update(payload).eq('id', cform.id)
      : await supabase.from('payout_accounts').insert([payload])
    if (error) { setMsg('No se pudo guardar la cuenta: ' + error.message); return }
    setMsg(''); setCform(null); cargar()
  }
  async function borrarCuenta(c) {
    if (!confirm(`¿Eliminar la cuenta «${c.nombre}» y TODOS sus pagos registrados? No se puede deshacer.`)) return
    await supabase.from('payout_accounts').delete().eq('id', c.id); setSel('todas'); cargar()
  }

  // Notas del pago = lo escrito a mano + bonos aplicados + sanciones aplicadas (con su motivo)
  const notasDe = (p) => notasCompletas(p, bonos, sanciones)

  const cuentaSel = sel !== 'todas' ? cuentaDe(sel) : null
  const lbl = { color: 'var(--text-muted)' }

  return (
    <div>
      <PageHeader
        title="Pagos a chatters"
        subtitle="Registro de lo pagado a cada chatter. Introduces la facturación de Infloww y el pago se calcula solo con la misma fórmula del Excel."
        action={<div className="flex gap-2"><Button variant="ghost" onClick={() => editarCuenta(null)}>+ Cuenta</Button><Button onClick={() => nuevoPago()} disabled={!cuentas.length}>+ Registrar pago</Button></div>}
      />

      {msg && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{msg}</p>}

      <div className="flex gap-2 mb-4">
        {[['pagos', 'Pagos'], ['calendario', 'Calendario'], ['bonos', 'Bonos']].map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)} className="px-4 py-1.5 rounded-md text-sm font-medium"
            style={{ background: vista === k ? 'var(--accent)' : 'var(--panel-alt)', color: vista === k ? '#000' : 'var(--text)', border: '1px solid ' + (vista === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>
        ))}
      </div>

      {vista === 'bonos' ? (
        <BonosTab cuentas={cuentas} bonos={bonos} pagos={pagos} onCambio={cargar} />
      ) : vista === 'calendario' ? (
        <CalendarioTab cuentas={cuentas} pagos={pagos} bonos={bonos} onRegistrar={nuevoPago} onVerPagos={(id) => { setSel(id); setVista('pagos') }} />
      ) : (<>
      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          ['Total pagado', money(resumen.total), true],
          ['Pagado este mes', money(resumen.mes)],
          ['Pendiente de pago', money(resumen.pendiente)],
          ['Facturación neta registrada', money(resumen.neta)],
        ].map(([t, v, g]) => (
          <Panel key={t} className="p-4">
            <p className="text-xs mb-1" style={lbl}>{t}</p>
            <p className={`text-xl font-display font-semibold tabular-nums ${g ? 'gold-text' : ''}`}>{v}</p>
          </Panel>
        ))}
      </div>

      {/* Selector de cuenta */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: 'todas', nombre: 'Todos' }, ...cuentas].map((c) => {
          const on = sel === c.id
          return (
            <button key={c.id} onClick={() => setSel(c.id)} className="px-3 py-1.5 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)', opacity: c.activa === false ? 0.55 : 1 }}>
              {c.nombre}
            </button>
          )
        })}
      </div>

      {/* Ficha de la cuenta */}
      {cuentaSel && (
        <Panel className="p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-medium">{cuentaSel.nombre}{cuentaSel.activa === false && <span className="text-xs ml-2" style={lbl}>(inactiva)</span>}</p>
              <p className="text-xs mt-1" style={lbl}>
                Inicio: {cuentaSel.fecha_inicio ? fmtF(cuentaSel.fecha_inicio) : '—'} · % habitual: {Math.round(num(cuentaSel.pct_defecto) * 100)}% ·
                Usuario del CRM: {perfiles.find((p) => p.id === cuentaSel.profile_id)?.full_name || 'sin enlazar'}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={() => editarCuenta(cuentaSel)} className="hover:underline" style={{ color: 'var(--accent)' }}>Editar cuenta</button>
              <button onClick={() => borrarCuenta(cuentaSel)} className="hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[['USDC · ETH', cuentaSel.wallet_usdc_eth], ['USDC · BSC', cuentaSel.wallet_usdc_bsc], ['USDT · BSC', cuentaSel.wallet_usdt_bsc], ['Binance', cuentaSel.wallet_binance]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <span style={lbl} className="shrink-0">{k}</span>
                <code className="truncate flex-1">{v}</code>
                <CopyButton text={v} label="Copiar" />
              </div>
            ))}
            {!cuentaSel.wallet_usdc_eth && !cuentaSel.wallet_usdc_bsc && !cuentaSel.wallet_usdt_bsc && !cuentaSel.wallet_binance && <p className="text-xs" style={lbl}>Sin direcciones guardadas.</p>}
          </div>
        </Panel>
      )}

      {/* Formulario de cuenta */}
      {cform && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">{cform.id ? 'Editar cuenta' : 'Nueva cuenta de pago'}</p>
          <form onSubmit={guardarCuenta} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs block mb-1" style={lbl}>Nombre</label><Input value={cform.nombre} onChange={(e) => setCform({ ...cform, nombre: e.target.value })} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Usuario del CRM (para que vea sus pagos)</label>
              <Select value={cform.profile_id} onChange={(e) => setCform({ ...cform, profile_id: e.target.value })}>
                <option value="">Sin enlazar</option>
                {perfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select></div>
            <div><label className="text-xs block mb-1" style={lbl}>Fecha de inicio</label><Input type="date" value={cform.fecha_inicio || ''} onChange={(e) => setCform({ ...cform, fecha_inicio: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>% habitual (0.15 = 15 %)</label><Input type="number" step="0.01" value={cform.pct_defecto} onChange={(e) => setCform({ ...cform, pct_defecto: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDC · ETH</label><Input value={cform.wallet_usdc_eth || ''} onChange={(e) => setCform({ ...cform, wallet_usdc_eth: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDC · BSC</label><Input value={cform.wallet_usdc_bsc || ''} onChange={(e) => setCform({ ...cform, wallet_usdc_bsc: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDT · BSC</label><Input value={cform.wallet_usdt_bsc || ''} onChange={(e) => setCform({ ...cform, wallet_usdt_bsc: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección de Binance</label><Input value={cform.wallet_binance || ''} onChange={(e) => setCform({ ...cform, wallet_binance: e.target.value })} /></div>
            <label className="text-sm flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={cform.activa} onChange={(e) => setCform({ ...cform, activa: e.target.checked })} /> Cuenta activa</label>
            <div className="sm:col-span-2 flex gap-2"><Button type="submit">Guardar cuenta</Button><Button type="button" variant="ghost" onClick={() => setCform(null)}>Cancelar</Button></div>
          </form>
        </Panel>
      )}

      {/* Formulario de pago */}
      {form && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">{editId ? 'Editar pago' : 'Registrar pago'}</p>
          <form onSubmit={guardarPago}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label className="text-xs block mb-1" style={lbl}>Chatter</label>
                <Select value={form.account_id} onChange={(e) => alCambiarCuenta(e.target.value)} required>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select></div>
              <div><label className="text-xs block mb-1" style={lbl}>Fecha del pago</label><Input type="date" value={form.fecha} onChange={(e) => alCambiarFecha(e.target.value)} required /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Facturación bruta ($)</label><Input type="number" step="0.01" value={form.bruta} onChange={(e) => alCambiarBruta(e.target.value)} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Facturación neta ($) · bruta −20 %</label><Input type="number" step="0.01" value={form.neta} onChange={(e) => alCambiarNeta(e.target.value)} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>% para el chatter (0.15)</label><Input type="number" step="0.01" value={form.pct} onChange={(e) => setF({ pct: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Bonos (+)</label><Input type="number" step="0.01" value={form.bonos} onChange={(e) => setF({ bonos: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Adelanto pagado (+)</label><Input type="number" step="0.01" value={form.adelanto} onChange={(e) => setF({ adelanto: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Sanciones (se descuenta)</label><Input type="number" step="0.01" min="0" value={form.penalizacion} onChange={(e) => setF({ penalizacion: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Deuda a descontar (se resta)</label><Input type="number" step="0.01" min="0" value={form.deuda} onChange={(e) => setF({ deuda: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Estado</label>
                <Select value={form.estado} onChange={(e) => setF({ estado: e.target.value })}><option>Pendiente</option><option>Pagado</option></Select>
                <p className="text-[11px] mt-1" style={lbl}>Se guarda Pendiente hasta que confirmes el pago.</p></div>
              <div className="col-span-2"><label className="text-xs block mb-1" style={lbl}>Notas</label><Input value={form.notas} onChange={(e) => setF({ notas: e.target.value })} placeholder="Notas propias (los bonos y sanciones se añaden solos)" /></div>
            </div>
            {(() => {
              const pd = pendientesDe(form.account_id, form.fecha, editId)
              if (!pd.bonos.length && !pd.sanciones.length) return null
              return (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {pd.bonos.length > 0 && (
                    <div className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Bonos que le corresponden en este pago</p>
                      {pd.bonos.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                          <input type="checkbox" checked={form.selB.includes(b.id)} onChange={() => alternarBono(b)} />
                          <span className="flex-1">{b.nombre} <span className="text-xs" style={lbl}>· cobro {fmtF(b.fecha_cobro)}</span></span>
                          <strong className="tabular-nums">+{money(b.monto)}</strong>
                        </label>
                      ))}
                    </div>
                  )}
                  {pd.sanciones.length > 0 && (
                    <div className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--danger)' }}>Sanciones a descontar</p>
                      {pd.sanciones.map((x) => (
                        <label key={x.id} className="flex items-start gap-2 text-sm py-0.5 cursor-pointer">
                          <input type="checkbox" className="mt-1" checked={form.selS.includes(x.id)} onChange={() => alternarSancion(x)} />
                          <span className="flex-1">{x.motivo} <span className="text-xs" style={lbl}>· {fmtF(x.fecha)}{pd.ultimo && x.fecha <= pd.ultimo && !editId ? ' · anterior al último pago' : ''}</span></span>
                          <strong className="tabular-nums" style={{ color: 'var(--danger)' }}>{num(x.monto) ? '−' + money(x.monto).replace('−', '') : 'sin importe'}</strong>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            {(() => {
              const c = cuentaDe(form.account_id)
              return c && !c.profile_id ? <p className="text-xs mt-3" style={lbl}>Esta cuenta no está enlazada a un usuario del CRM, así que no se le pueden aplicar sanciones automáticamente. Enlázala en «Editar cuenta».</p> : null
            })()}
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Button type="submit">{editId ? 'Guardar cambios' : 'Guardar pago'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setForm(null); setEditId(null); setMsg('') }}>Cancelar</Button>
              <span className="ml-auto text-sm">Pago al chatter: <strong className="gold-text text-base tabular-nums">{money(previo)}</strong></span>
            </div>
          </form>
        </Panel>
      )}

      {/* Tabla */}
      <Panel>
        {cargando ? <p className="p-6 text-sm" style={lbl}>Cargando…</p> : visibles.length === 0 ? (
          <p className="p-6 text-sm text-center" style={lbl}>No hay pagos registrados{cuentaSel ? ' para esta cuenta' : ''}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', ...(sel === 'todas' ? ['Chatter'] : []), 'Bruta', 'Neta', '%', 'Bonos', 'Adelanto', 'Sanciones', 'Deuda', 'Pago', 'Estado', 'Notas', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap" style={lbl}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const celda = (v) => (num(v) ? money(v) : <span style={lbl}>—</span>)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtF(p.fecha)}</td>
                      {sel === 'todas' && <td className="px-3 py-2.5 whitespace-nowrap">{cuentaDe(p.account_id)?.nombre}</td>}
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.fact_bruta)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.fact_neta)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.pct != null ? Math.round(num(p.pct) * 100) + '%' : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.bonos)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.adelanto)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: num(p.penalizacion) ? 'var(--danger)' : undefined }}>{celda(p.penalizacion)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: num(p.deuda) ? 'var(--danger)' : undefined }}>{celda(p.deuda)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold gold-text whitespace-nowrap">{money(calcPago(p))}</td>
                      <td className="px-3 py-2.5">
                        {p.estado === 'Pagado'
                          ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>Pagado</span>
                          : <button onClick={() => marcarPagado(p)} title="Marcar como pagado" className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pendiente ✓</button>}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[320px]" style={lbl}>{notasDe(p)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        <button onClick={() => editarPago(p)} className="hover:underline mr-3" style={{ color: 'var(--accent)' }}>Editar</button>
                        <button onClick={() => borrarPago(p)} style={{ color: 'var(--danger)' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      </>)}
    </div>
  )
}

// =====================================================================================
// CALENDARIO: próximos pagos (lunes alternos) y cobro de bonos (días 1 y 16)
// =====================================================================================
function CalendarioTab({ cuentas, pagos, bonos, onRegistrar, onVerPagos }) {
  const hoy = hoyISO()
  const ancla = useMemo(() => anclaPagos(pagos), [pagos])
  const [mes, setMes] = useState(() => { const d = aDate(hoy); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [dia, setDia] = useState(null)
  const lbl = { color: 'var(--text-muted)' }
  const activas = cuentas.filter((c) => c.activa !== false)

  const fechasBono = useMemo(() => new Set(bonos.map((b) => b.fecha_cobro)), [bonos])
  const tipoDia = (iso) => ({ pago: esDiaPago(iso, ancla), bono: esDiaBono(iso) || fechasBono.has(iso) })

  // próximas 6 fechas con algo que hacer
  const proximas = useMemo(() => {
    const out = []
    let d = hoy
    for (let i = 0; i < 70 && out.length < 6; i++) {
      const t = { pago: esDiaPago(d, ancla), bono: esDiaBono(d) || fechasBono.has(d) }
      if (t.pago || t.bono) out.push({ fecha: d, ...t })
      d = sumarDias(d, 1)
    }
    return out
  }, [hoy, ancla, fechasBono])

  // celdas del mes (semana empieza en lunes)
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const lead = (primero.getDay() + 6) % 7
    const n = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
    const arr = Array(lead).fill(null)
    for (let i = 1; i <= n; i++) arr.push(aISO(new Date(mes.getFullYear(), mes.getMonth(), i)))
    while (arr.length % 7) arr.push(null)
    return arr
  }, [mes])

  const pendientes = pagos.filter((p) => p.estado === 'Pendiente')
  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const enDias = (iso) => { const n = difDias(iso, hoy); return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? `hace ${-n} d` : `en ${n} días` }

  const det = dia ? tipoDia(dia) : null
  const pagosDia = dia ? pagos.filter((p) => p.fecha === dia) : []
  const bonosDia = dia ? bonos.filter((b) => b.fecha_cobro === dia) : []

  return (
    <div>
      {!ancla && <Panel className="p-4 mb-4"><p className="text-sm" style={lbl}>Todavía no hay ningún pago registrado en lunes, así que no se puede calcular el ciclo quincenal. Registra uno y el calendario se generará solo.</p></Panel>}

      {pendientes.length > 0 && (
        <Panel className="p-4 mb-4" style={{ borderColor: 'var(--accent)' }}>
          <p className="text-sm"><strong style={{ color: 'var(--accent)' }}>{pendientes.length} {pendientes.length === 1 ? 'pago pendiente' : 'pagos pendientes'}</strong> de confirmar: {money(pendientes.reduce((t, p) => t + calcPago(p), 0))} en total
            {' '}<span style={lbl}>({pendientes.slice(0, 6).map((p) => `${cuentaDe(p.account_id)?.nombre} ${fmtF(p.fecha)}`).join(' · ')}{pendientes.length > 6 ? '…' : ''})</span></p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="px-2 py-1 rounded hover:opacity-70" aria-label="Mes anterior">←</button>
            <p className="font-medium">{NOMBRE_MES[mes.getMonth()]} {mes.getFullYear()}</p>
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="px-2 py-1 rounded hover:opacity-70" aria-label="Mes siguiente">→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1" style={lbl}>{DIAS_SEM.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((iso, i) => {
              if (!iso) return <div key={i} />
              const t = tipoDia(iso)
              const esHoy = iso === hoy
              const on = dia === iso
              return (
                <button key={iso} onClick={() => setDia(on ? null : iso)} className="rounded-md py-2 text-sm flex flex-col items-center gap-1 min-h-[54px]"
                  style={{ background: on ? 'var(--accent-soft)' : t.pago ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : esHoy ? 'var(--text-muted)' : 'var(--border)'}`, fontWeight: esHoy ? 700 : 400 }}>
                  <span>{Number(iso.slice(8))}</span>
                  <span className="flex gap-1 h-2">
                    {t.pago && <span title="Pago de nómina" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--accent)' }} />}
                    {t.bono && <span title="Cobro de bonos" style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--success)' }} />}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs" style={lbl}>
            <span className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--accent)' }} /> Pago (lunes alternos)</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--success)' }} /> Bonos (días 1 y 16)</span>
          </div>
          {ancla && <p className="text-[11px] mt-2" style={lbl}>Ciclo calculado desde el último lunes de pago registrado ({fmtF(ancla)}), cada 14 días.</p>}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-sm font-medium mb-3">Próximas fechas</p>
            {proximas.length === 0 ? <p className="text-sm" style={lbl}>Sin fechas próximas.</p> : proximas.map((p) => (
              <button key={p.fecha} onClick={() => { setDia(p.fecha); setMes(new Date(aDate(p.fecha).getFullYear(), aDate(p.fecha).getMonth(), 1)) }}
                className="w-full flex items-center gap-2 py-2 text-sm text-left hover:opacity-80" style={{ borderBottom: '1px solid var(--border)' }}>
                <strong className="tabular-nums w-[72px]">{fmtF(p.fecha)}</strong>
                <span className="flex gap-1.5 flex-wrap">
                  {p.pago && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pago</span>}
                  {p.bono && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>Bonos</span>}
                </span>
                <span className="ml-auto text-xs" style={lbl}>{enDias(p.fecha)}</span>
              </button>
            ))}
          </Panel>

          {dia && (
            <Panel className="p-4">
              <p className="text-sm font-medium mb-1">{fmtF(dia)} · {enDias(dia)}</p>
              <p className="text-xs mb-3" style={lbl}>{[det.pago && 'Día de pago de nómina', det.bono && 'Día de cobro de bonos'].filter(Boolean).join(' · ') || 'Sin pagos previstos este día'}</p>
              {activas.map((c) => {
                const pg = pagosDia.find((p) => p.account_id === c.id)
                const bs = bonosDia.filter((b) => b.account_id === c.id)
                if (!pg && !det.pago && !bs.length) return null
                return (
                  <div key={c.id} className="flex items-center gap-2 py-2 text-sm flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-medium">{c.nombre}</span>
                    {bs.length > 0 && <span className="text-xs" style={lbl}>{bs.map((b) => `${b.nombre} +${money(b.monto)}`).join(', ')}</span>}
                    <span className="ml-auto">
                      {pg ? (
                        <button onClick={() => onVerPagos(c.id)} className="text-xs px-2 py-0.5 rounded-full" style={pg.estado === 'Pagado' ? { background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' } : { background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          {pg.estado} · {money(calcPago(pg))}
                        </button>
                      ) : (det.pago || bs.length > 0) ? (
                        <button onClick={() => onRegistrar(dia, c.id)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Registrar pago</button>
                      ) : null}
                    </span>
                  </div>
                )
              })}
              {!det.pago && !det.bono && pagosDia.length === 0 && <p className="text-xs" style={lbl}>Elige otra fecha o registra un pago manualmente en la pestaña Pagos.</p>}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

// Notas del pago = notas escritas + bonos aplicados + sanciones aplicadas
function notasCompletas(p, bonos, sanciones) {
  const partes = []
  if (p.notas) partes.push(p.notas)
  const b = (bonos || []).filter((x) => x.aplicado_en === p.id)
  if (b.length) partes.push('Bonos: ' + b.map((x) => `${x.nombre} (+${money(x.monto)})`).join(', '))
  const s = (sanciones || []).filter((x) => x.payout_id === p.id)
  if (s.length) partes.push('Sanciones: ' + s.map((x) => `${x.motivo}${num(x.monto) ? ` (−${money(x.monto).replace('−', '')})` : ''}`).join('; '))
  return partes.join(' · ')
}

// =====================================================================================
// BONOS: el admin define cada bono, su importe por chatter y la fecha de cobro
// =====================================================================================
function BonosTab({ cuentas, bonos, pagos, onCambio }) {
  const activas = cuentas.filter((c) => c.activa !== false)
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(proximoBono(hoyISO()))
  const [nota, setNota] = useState('')
  const [montos, setMontos] = useState({})
  const [comun, setComun] = useState('')
  const [filtro, setFiltro] = useState('pendientes')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const lbl = { color: 'var(--text-muted)' }
  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const nombres = [...new Set(bonos.map((b) => b.nombre))]

  function aplicarComun() { const m = {}; activas.forEach((c) => { m[c.id] = comun }); setMontos(m) }

  async function crear(e) {
    e.preventDefault(); setError('')
    const filas = activas.filter((c) => num(montos[c.id]) > 0).map((c) => ({ account_id: c.id, nombre: nombre.trim(), monto: num(montos[c.id]), fecha_cobro: fecha, nota: nota.trim() || null }))
    if (!nombre.trim()) { setError('Ponle un nombre al bono.'); return }
    if (!filas.length) { setError('Indica el importe de al menos un chatter.'); return }
    const { error: err } = await supabase.from('payout_bonuses').insert(filas)
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    setNombre(''); setNota(''); setMontos({}); setComun(''); onCambio()
  }
  async function guardarEdicion(e) {
    e.preventDefault()
    const { error: err } = await supabase.from('payout_bonuses').update({ nombre: edit.nombre.trim(), monto: num(edit.monto), fecha_cobro: edit.fecha_cobro, nota: edit.nota?.trim() || null }).eq('id', edit.id)
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    setEdit(null); onCambio()
  }
  async function borrar(b) {
    if (!confirm(`¿Eliminar el bono «${b.nombre}» de ${cuentaDe(b.account_id)?.nombre}?${b.aplicado_en ? ' Ya está aplicado a un pago: el importe seguirá en ese pago, pero dejará de aparecer en sus notas.' : ''}`)) return
    await supabase.from('payout_bonuses').delete().eq('id', b.id); onCambio()
  }

  const lista = bonos.filter((b) => filtro === 'todos' || (filtro === 'pendientes' ? !b.aplicado_en : !!b.aplicado_en))
  const totalPend = r2(bonos.filter((b) => !b.aplicado_en).reduce((s, b) => s + num(b.monto), 0))

  return (
    <div>
      <Panel className="p-5 mb-4">
        <p className="text-sm font-medium mb-1">Nuevo bono</p>
        <p className="text-xs mb-4" style={lbl}>Define el bono, su fecha de cobro y cuánto le corresponde a cada chatter (deja en blanco a quien no lo cobre). Al registrar el pago de esa fecha, el importe se suma solo en «Bonos» y el nombre del bono aparece en las notas.</p>
        <form onSubmit={crear}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div><label className="text-xs block mb-1" style={lbl}>Nombre del bono</label>
              <Input list="nombres-bono" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Bono quincenal, Chatter del mes…" required />
              <datalist id="nombres-bono">{nombres.map((n) => <option key={n} value={n} />)}</datalist></div>
            <div><label className="text-xs block mb-1" style={lbl}>Fecha de cobro <span style={{ color: 'var(--accent)' }}>· habitual: días 1 y 16</span></label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Nota (opcional)</label><Input value={nota} onChange={(e) => setNota(e.target.value)} /></div>
          </div>
          <div className="flex items-end gap-2 mb-3 flex-wrap">
            <div><label className="text-xs block mb-1" style={lbl}>Mismo importe para todos</label><Input type="number" step="0.01" value={comun} onChange={(e) => setComun(e.target.value)} placeholder="15" /></div>
            <Button type="button" variant="ghost" onClick={aplicarComun}>Rellenar</Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            {activas.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <span className="text-sm flex-1 truncate">{c.nombre}</span>
                <div className="w-24"><Input type="number" step="0.01" min="0" value={montos[c.id] ?? ''} onChange={(e) => setMontos({ ...montos, [c.id]: e.target.value })} placeholder="$" /></div>
              </div>
            ))}
          </div>
          {error && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button type="submit">Crear bono</Button>
        </form>
      </Panel>

      {edit && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">Editar bono · {cuentaDe(edit.account_id)?.nombre}</p>
          <form onSubmit={guardarEdicion} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className="text-xs block mb-1" style={lbl}>Bono</label><Input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Importe ($)</label><Input type="number" step="0.01" value={edit.monto} onChange={(e) => setEdit({ ...edit, monto: e.target.value })} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Fecha de cobro</label><Input type="date" value={edit.fecha_cobro} onChange={(e) => setEdit({ ...edit, fecha_cobro: e.target.value })} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Nota</label><Input value={edit.nota || ''} onChange={(e) => setEdit({ ...edit, nota: e.target.value })} /></div>
            <div className="col-span-2 lg:col-span-4 flex gap-2"><Button type="submit">Guardar</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></div>
          </form>
        </Panel>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {[['pendientes', 'Pendientes'], ['aplicados', 'Aplicados'], ['todos', 'Todos']].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className="px-3 py-1 rounded-full text-sm"
            style={{ background: filtro === k ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${filtro === k ? 'var(--accent)' : 'var(--border)'}`, color: filtro === k ? 'var(--accent)' : 'var(--text)' }}>{t}</button>
        ))}
        <span className="ml-auto text-sm" style={lbl}>Bonos pendientes de cobro: <strong style={{ color: 'var(--text)' }}>{money(totalPend)}</strong></span>
      </div>

      <Panel>
        {lista.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay bonos en esta vista.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Cobro', 'Bono', 'Chatter', 'Importe', 'Estado', 'Nota', ''].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-medium" style={lbl}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lista.map((b) => {
                  const pago = b.aplicado_en ? pagos.find((p) => p.id === b.aplicado_en) : null
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtF(b.fecha_cobro)}</td>
                      <td className="px-3 py-2.5">{b.nombre}</td>
                      <td className="px-3 py-2.5">{cuentaDe(b.account_id)?.nombre}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold gold-text">{money(b.monto)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {b.aplicado_en
                          ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>Aplicado{pago ? ` · pago ${fmtF(pago.fecha)}` : ''}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pendiente</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={lbl}>{b.nota || ''}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        <button onClick={() => { setEdit(b); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="hover:underline mr-3" style={{ color: 'var(--accent)' }}>Editar</button>
                        <button onClick={() => borrar(b)} style={{ color: 'var(--danger)' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// =====================================================================================
// CHATTER / MANAGER: solo ve sus propios pagos
// =====================================================================================
function MisPagos() {
  const [filas, setFilas] = useState(null)
  const [bonos, setBonos] = useState([])
  const [sanciones, setSanciones] = useState([])
  useEffect(() => {
    Promise.all([
      supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }),
      supabase.from('payout_bonuses').select('*'),
      supabase.from('sanctions').select('id, motivo, monto, fecha, payout_id').not('payout_id', 'is', null),
    ]).then(([{ data: p }, { data: b }, { data: s }]) => { setFilas(p || []); setBonos(b || []); setSanciones(s || []) })
  }, [])
  const total = (filas || []).filter((p) => p.estado === 'Pagado').reduce((s, p) => s + calcPago(p), 0)
  return (
    <div>
      <PageHeader title="Mis pagos" subtitle="El detalle de lo que has cobrado en cada pago." />
      {filas === null ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        : filas.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes pagos registrados.</p>
        : (
          <>
            <Panel className="p-4 mb-4 inline-block min-w-[220px]">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total cobrado</p>
              <p className="text-xl font-display font-semibold gold-text tabular-nums">{money(total)}</p>
            </Panel>
            {filas.map((p) => (
              <Panel key={p.id} className="p-5 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <strong>Pago del {fmtF(p.fecha)}</strong>
                  <span>{p.estado === 'Pagado' ? 'Pagado' : 'Pendiente'} · <strong className="gold-text">{money(calcPago(p))}</strong></span>
                </div>
                <div className="space-y-1.5 text-sm">
                  {[
                    ['Facturación neta', money(p.fact_neta)],
                    [`× Comisión ${Math.round(num(p.pct) * 100)}%`, money(num(p.fact_neta) * num(p.pct))],
                    ['+ Bonos', money(p.bonos)],
                    ['+ Adelanto', money(p.adelanto)],
                    ['− Sanciones', money(p.penalizacion)],
                    ['− Deuda descontada', money(p.deuda)],
                  ].filter(([, v], i) => i < 2 || v !== '$0.00').map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{k}</span><strong>{v}</strong></div>
                  ))}
                </div>
                {notasCompletas(p, bonos, sanciones) && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{notasCompletas(p, bonos, sanciones)}</p>}
              </Panel>
            ))}
          </>
        )}
    </div>
  )
}
