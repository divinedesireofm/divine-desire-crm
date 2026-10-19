import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { getProfilesByRoles } from '../lib/roles'

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

const VACIO = { account_id: '', fecha: hoyISO(), bruta: '', neta: '', pct: '', bonos: '', adelanto: '', penalizacion: '', deuda: '', notas: '', estado: 'Pendiente', cuotasN: 2, cuotasFilas: [], adelantoOriginal: 0, selC: [] }

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
// Los n siguientes días de pago de nómina (lunes alternos) POSTERIORES a una fecha; los días de bonos no cuentan.
function siguientesDiasPago(fecha, ancla, n) {
  const out = []
  let d = sumarDias(fecha, 1)
  for (let i = 0; i < 500 && out.length < n; i++) {
    if (ancla ? esDiaPago(d, ancla) : (aDate(d).getDay() === 1 && (out.length === 0 || difDias(d, out[out.length - 1]) >= 14))) out.push(d)
    d = sumarDias(d, 1)
  }
  return out
}
function proximoBono(desde) {
  let d = desde
  for (let i = 0; i < 40; i++) { if (esDiaBono(d)) return d; d = sumarDias(d, 1) }
  return desde
}
const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const normNombre = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(extrabajador\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
// ¿Esta cuenta de pago ya es de esta persona? (por enlace o por nombre parecido)
function cuentaEsDe(cuenta, perfil) {
  if (cuenta.profile_id) return cuenta.profile_id === perfil.id
  const a = normNombre(cuenta.nombre), b = normNombre(perfil.full_name)
  if (!a || !b) return false
  return a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))
}
const fmtAlta = (ts) => (ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')

// Métodos de cobro: [clave, etiqueta, campo de la dirección, campo del QR]
const WALLETS = [
  ['usdc_eth', 'USDC · ETH', 'wallet_usdc_eth', 'qr_usdc_eth'],
  ['usdc_bsc', 'USDC · BSC', 'wallet_usdc_bsc', 'qr_usdc_bsc'],
  ['usdt_bsc', 'USDT · BSC', 'wallet_usdt_bsc', 'qr_usdt_bsc'],
  ['binance', 'Binance', 'wallet_binance', 'qr_binance'],
]
// Reduce la imagen del QR (sigue siendo legible) y la devuelve como texto para guardarla en la cuenta
function imagenAQr(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const hacer = (max, tipo, q) => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height)
        return c.toDataURL(tipo, q)
      }
      let d = hacer(520, 'image/png')
      if (d.length > 220000) d = hacer(420, 'image/jpeg', 0.9)
      URL.revokeObjectURL(url)
      resolve(d)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')) }
    img.src = url
  })
}

// Reparto por defecto de un adelanto en n cuotas con sus fechas
function cuotasPorDefecto(total, n, fechaBase, ancla, previas) {
  const fechas = siguientesDiasPago(fechaBase, ancla, n)
  const base = r2(total / n)
  return Array.from({ length: n }, (_, i) => {
    const prev = previas?.[i]
    return {
      fecha: prev?.ft ? prev.fecha : (fechas[i] || sumarDias(fechaBase, 14 * (i + 1))),
      ft: !!prev?.ft,
      monto: i === n - 1 ? r2(total - base * (n - 1)) : base,
    }
  })
}
const sumaCuotas = (filas) => r2((filas || []).reduce((t, x) => t + num(x.monto), 0))

// Selector de «en cuántas veces» + fecha y importe de cada cuota
function Fraccionador({ total, fechaBase, ancla, n, setN, filas, setFilas }) {
  const lbl = { color: 'var(--text-muted)' }
  const sel = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }
  useEffect(() => {
    if (!(total > 0) || !fechaBase) return
    setFilas(cuotasPorDefecto(total, n, fechaBase, ancla, filas))
  }, [total, n, fechaBase, ancla])
  const suma = sumaCuotas(filas)
  const cuadra = Math.abs(suma - r2(total)) < 0.011
  function cambiar(i, patch) { setFilas(filas.map((f, j) => (j === i ? { ...f, ...patch } : f))) }
  return (
    <div className="rounded-md p-3 mt-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 flex-wrap text-sm mb-2">
        <span style={lbl}>Se descuenta en</span>
        <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded px-2 py-1 text-sm" style={sel}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k} {k === 1 ? 'vez' : 'veces'}</option>)}
        </select>
        <span className="text-xs" style={lbl}>Elige la fecha de cada cobro; por defecto, los siguientes días de pago.</span>
      </div>
      <div className="grid gap-2">
        {filas.map((f, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap text-sm">
            <span className="w-16 text-xs" style={lbl}>Cuota {i + 1}/{n}</span>
            <input type="date" value={f.fecha} onChange={(e) => cambiar(i, { fecha: e.target.value, ft: true })} className="rounded px-2 py-1 text-sm" style={sel} />
            <span style={lbl}>−$</span>
            <input type="number" step="0.01" min="0" value={f.monto} onChange={(e) => cambiar(i, { monto: e.target.value })} className="rounded px-2 py-1 text-sm w-28" style={sel} />
          </div>
        ))}
      </div>
      {!cuadra && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>Las cuotas suman {money(suma)} y el adelanto es de {money(total)}. Ajusta los importes para que cuadren.</p>}
    </div>
  )
}

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
  const [cuotas, setCuotas] = useState([])
  const creandoCuentas = useRef(false)
  const [qrGrande, setQrGrande] = useState(null) // { src, titulo }

  // Cada chatter activo del equipo tiene su cuenta de pago: si falta, se crea sola y queda marcada «pendiente de editar»
  async function asegurarCuentas(actuales) {
    if (creandoCuentas.current) return []
    creandoCuentas.current = true
    try {
      const chatters = await getProfilesByRoles(['chatter'], { onlyActive: true })
      const nuevos = chatters.filter((pf) => !actuales.some((c) => cuentaEsDe(c, pf)))
      if (!nuevos.length) return []
      const filas = nuevos.map((pf) => ({ nombre: pf.full_name, profile_id: pf.id, fecha_inicio: hoyISO(), pct_defecto: 0.15, activa: true, pendiente_editar: true }))
      let { data, error } = await supabase.from('payout_accounts').insert(filas).select()
      if (error) { // sin la migración 62 no existe la columna del aviso: se crean igualmente
        ;({ data, error } = await supabase.from('payout_accounts').insert(filas.map(({ pendiente_editar, ...r }) => r)).select())
      }
      return error ? [] : (data || [])
    } catch { return [] } finally { creandoCuentas.current = false }
  }

  async function cargar() {
    const [{ data: c }, { data: p }, { data: pr }, { data: bn }, { data: sn }, { data: cu }] = await Promise.all([
      supabase.from('payout_accounts').select('*').order('created_at'),
      supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }).limit(5000),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('payout_bonuses').select('*').order('fecha_cobro', { ascending: false }).limit(2000),
      supabase.from('sanctions').select('id, chatter_id, motivo, monto, fecha, payout_id').order('fecha', { ascending: false }).limit(2000),
      supabase.from('payout_advance_installments').select('*').order('fecha_prevista').limit(2000),
    ])
    const nuevasCuentas = await asegurarCuentas(c || [])
    setCuentas([...(c || []), ...nuevasCuentas]); setPagos(p || []); setPerfiles(pr || []); setBonos(bn || []); setSanciones(sn || []); setCuotas(cu || []); setCargando(false)
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
    const cu = cuotas.filter((x) => x.account_id === accountId && ((pagoId && x.aplicado_en === pagoId) || (!x.aplicado_en && x.fecha_prevista <= fecha)))
    return { bonos: b, sanciones: s, cuotas: cu, ultimo }
  }
  function seleccionPorDefecto(accountId, fecha) {
    const pd = pendientesDe(accountId, fecha, null)
    const selB = pd.bonos.map((x) => x.id)
    const selS = pd.sanciones.filter((x) => !pd.ultimo || x.fecha > pd.ultimo).map((x) => x.id)
    const sumB = r2(pd.bonos.filter((x) => selB.includes(x.id)).reduce((t, x) => t + num(x.monto), 0))
    const sumS = r2(pd.sanciones.filter((x) => selS.includes(x.id)).reduce((t, x) => t + num(x.monto), 0))
    const selC = pd.cuotas.map((x) => x.id)
    const sumC = r2(pd.cuotas.reduce((t, x) => t + num(x.monto), 0))
    return { selB, selS, selC, bonos: sumB || '', penalizacion: sumS || '', deuda: sumC || '' }
  }

  // ---------- pago ----------
  function nuevoPago(fechaIni, cuentaId) {
    const c = cuentaId ? cuentaDe(cuentaId) : sel !== 'todas' ? cuentaDe(sel) : cuentas.find((x) => x.activa !== false) || cuentas[0]
    const fecha = fechaIni || hoyISO()
    setEditId(null)
    setForm({ ...VACIO, fecha, account_id: c?.id || '', pct: c?.pct_defecto ?? 0.15, ...(c ? seleccionPorDefecto(c.id, fecha) : { selB: [], selS: [], selC: [] }) })
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
      selC: cuotas.filter((x) => x.aplicado_en === p.id).map((x) => x.id),
      cuotasN: cuotas.filter((x) => x.origen_id === p.id).length || 2, cuotasFilas: [],
      adelantoOriginal: num(p.adelanto),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function setF(patch) { setForm((f) => ({ ...f, ...patch })) }
  function alCambiarBruta(v) { setF({ bruta: v, neta: v === '' ? '' : r2(num(v) * OF_NETO) }) }
  function alCambiarNeta(v) { setF({ neta: v, bruta: v === '' ? '' : r2(num(v) / OF_NETO) }) }
  function alCambiarCuenta(id) {
    const c = cuentaDe(id)
    setF({ account_id: id, pct: c?.pct_defecto ?? form.pct, ...(editId ? { selB: [], selS: [], selC: [] } : seleccionPorDefecto(id, form.fecha)) })
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

  function alternarCuota(x) {
    const on = form.selC.includes(x.id)
    setF({ selC: on ? form.selC.filter((i) => i !== x.id) : [...form.selC, x.id], deuda: r2(Math.max(0, num(form.deuda) + (on ? -1 : 1) * num(x.monto))) || '' })
  }

  const previo = form ? calcPago({ fact_neta: form.neta, pct: form.pct, bonos: form.bonos, adelanto: form.adelanto, penalizacion: -Math.abs(num(form.penalizacion)), deuda: -Math.abs(num(form.deuda)) }) : 0

  async function guardarPago(e) {
    e.preventDefault()
    if (!form.account_id || !form.fecha) return
    const cambiaAdelanto = !editId ? num(form.adelanto) > 0 : num(form.adelanto) !== form.adelantoOriginal
    if (cambiaAdelanto && num(form.adelanto) > 0 && form.cuotasFilas.length && Math.abs(sumaCuotas(form.cuotasFilas) - r2(num(form.adelanto))) > 0.011) {
      setMsg('Las cuotas del adelanto no suman lo mismo que el adelanto. Ajusta los importes.'); return
    }
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
    const prevC = cuotas.filter((x) => x.aplicado_en === pid).map((x) => x.id)
    const quitarB = prevB.filter((i) => !form.selB.includes(i)); const quitarS = prevS.filter((i) => !form.selS.includes(i))
    const quitarC = prevC.filter((i) => !form.selC.includes(i))
    const ops = []
    if (quitarC.length) ops.push(supabase.from('payout_advance_installments').update({ aplicado_en: null }).in('id', quitarC))
    if (form.selC.length) ops.push(supabase.from('payout_advance_installments').update({ aplicado_en: pid }).in('id', form.selC))
    if (quitarB.length) ops.push(supabase.from('payout_bonuses').update({ aplicado_en: null }).in('id', quitarB))
    if (quitarS.length) ops.push(supabase.from('sanctions').update({ payout_id: null }).in('id', quitarS))
    if (form.selB.length) ops.push(supabase.from('payout_bonuses').update({ aplicado_en: pid }).in('id', form.selB))
    if (form.selS.length) ops.push(supabase.from('sanctions').update({ payout_id: pid }).in('id', form.selS))
    let res = await Promise.all(ops)
    // Adelanto → se reparte en cuotas en los siguientes días de pago (solo si es nuevo o ha cambiado el importe)
    const adel = num(form.adelanto)
    const propias = cuotas.filter((x) => x.origen_id === pid)
    let avisoAdelanto = ''
    if (!editId ? adel > 0 : adel !== form.adelantoOriginal) {
      if (propias.some((x) => x.aplicado_en)) {
        avisoAdelanto = 'Ojo: alguna cuota de este adelanto ya se descontó en otro pago, así que no se ha recalculado el reparto.'
      } else {
        if (propias.length) res.push(await supabase.from('payout_advance_installments').delete().eq('origen_id', pid))
        if (adel > 0) {
          const base = form.cuotasFilas.length ? form.cuotasFilas : cuotasPorDefecto(adel, Math.min(12, Math.max(1, Math.round(num(form.cuotasN)) || 2)), form.fecha, anclaPagos(pagos), [])
          const n = base.length
          const filas = base.map((f, i) => ({ account_id: form.account_id, origen_id: pid, num: i + 1, total: n, monto: num(f.monto), fecha_prevista: f.fecha }))
          res.push(await supabase.from('payout_advance_installments').insert(filas))
        }
      }
    }
    if (avisoAdelanto) setMsg(avisoAdelanto)
    else if (res.some((r) => r.error)) setMsg('El pago se guardó, pero no se pudieron enlazar algunos bonos/sanciones: ' + res.find((r) => r.error).error.message)
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
      qr_usdc_eth: cform.qr_usdc_eth || null, qr_usdc_bsc: cform.qr_usdc_bsc || null, qr_usdt_bsc: cform.qr_usdt_bsc || null, qr_binance: cform.qr_binance || null,
    }
    if (!payload.nombre) return
    payload.pendiente_editar = false
    let res = cform.id
      ? await supabase.from('payout_accounts').update(payload).eq('id', cform.id)
      : await supabase.from('payout_accounts').insert([payload])
    if (res.error && /pendiente_editar|qr_/.test(res.error.message || '')) { // aún sin migraciones 62/63
      const { pendiente_editar, qr_usdc_eth, qr_usdc_bsc, qr_usdt_bsc, qr_binance, ...resto } = payload
      res = cform.id
        ? await supabase.from('payout_accounts').update(resto).eq('id', cform.id)
        : await supabase.from('payout_accounts').insert([resto])
    }
    const { error } = res
    if (error) { setMsg('No se pudo guardar la cuenta: ' + error.message); return }
    setMsg(''); setCform(null); cargar()
  }
  async function borrarCuenta(c) {
    if (!confirm(`¿Eliminar la cuenta «${c.nombre}» y TODOS sus pagos registrados? No se puede deshacer.`)) return
    await supabase.from('payout_accounts').delete().eq('id', c.id); setSel('todas'); cargar()
  }

  // Notas del pago = lo escrito a mano + bonos aplicados + sanciones aplicadas (con su motivo)
  const notasDe = (p) => notasCompletas(p, bonos, sanciones, cuotas)

  const cuentaSel = sel !== 'todas' ? cuentaDe(sel) : null
  const lbl = { color: 'var(--text-muted)' }

  return (
    <div>
      <PageHeader
        title="Pagos a chatters"
        subtitle="Registro de lo pagado a cada chatter. Introduces la facturación de Infloww y el pago se calcula solo con la misma fórmula del Excel."
        action={<div className="flex flex-wrap gap-2"><Button onClick={() => nuevoPago()} disabled={!cuentas.length}>+ Registrar pago</Button></div>}
      />

      {msg && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{msg}</p>}

      <div className="flex gap-2 mb-4">
        {[['pagos', 'Pagos'], ['calendario', 'Calendario'], ['bonos', 'Bonos'], ['adelantos', 'Adelantos']].map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)} className="px-4 py-1.5 rounded-md text-sm font-medium"
            style={{ background: vista === k ? 'var(--accent)' : 'var(--panel-alt)', color: vista === k ? '#000' : 'var(--text)', border: '1px solid ' + (vista === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>
        ))}
      </div>

      {vista === 'bonos' ? (
        <BonosTab cuentas={cuentas} bonos={bonos} pagos={pagos} onCambio={cargar} />
      ) : vista === 'adelantos' ? (
        <AdelantosTab cuentas={cuentas} cuotas={cuotas} pagos={pagos} onCambio={cargar} />
      ) : vista === 'calendario' ? (
        <CalendarioTab cuentas={cuentas} pagos={pagos} bonos={bonos} cuotas={cuotas} onRegistrar={nuevoPago} onVerPagos={(id) => { setSel(id); setVista('pagos') }} />
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

      {cuentas.some((c) => c.pendiente_editar) && (
        <Panel className="p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
          <p className="text-sm">
            <strong style={{ color: 'var(--gold)' }}>⚠ Pendiente de editar:</strong>{' '}
            {cuentas.filter((c) => c.pendiente_editar).map((c) => c.nombre).join(', ')}
            <span style={lbl}> · Se han dado de alta solos al entrar en activo en el equipo. Ábrelos y completa su % y sus direcciones de cobro.</span>
          </p>
        </Panel>
      )}

      {/* Selector de cuenta */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: 'todas', nombre: 'Todos' }, ...cuentas].map((c) => {
          const on = sel === c.id
          return (
            <button key={c.id} onClick={() => setSel(c.id)} className="px-3 py-1.5 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)', opacity: c.activa === false ? 0.55 : 1 }}>
              {c.pendiente_editar && <span title="Pendiente de editar" style={{ color: 'var(--gold)' }}>⚠ </span>}{c.nombre}
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
          {cuentaSel.pendiente_editar && (
            <div className="mt-3 flex items-center gap-3 flex-wrap rounded-md px-3 py-2 text-sm" style={{ background: 'color-mix(in srgb, var(--gold) 14%, transparent)', border: '1px solid var(--gold)' }}>
              <span>⚠ <strong>Pendiente de editar</strong>: cuenta creada automáticamente. Revisa el % y añade sus direcciones de cobro.</span>
              <Button variant="ghost" onClick={() => editarCuenta(cuentaSel)}>Editar ahora</Button>
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {WALLETS.filter(([, , dir, qr]) => cuentaSel[dir] || cuentaSel[qr]).map(([k, etiqueta, dir, qr]) => (
              <div key={k} className="flex items-center gap-3 text-xs rounded-md px-2.5 py-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                {cuentaSel[qr] && (
                  <button type="button" onClick={() => setQrGrande({ src: cuentaSel[qr], titulo: `${cuentaSel.nombre} · ${etiqueta}` })} title="Ampliar QR" className="shrink-0 rounded" style={{ background: '#fff', padding: 2 }}>
                    <img src={cuentaSel[qr]} alt={`QR ${etiqueta}`} style={{ width: 64, height: 64, objectFit: 'contain', display: 'block' }} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <span style={lbl} className="block mb-1">{etiqueta}</span>
                  {cuentaSel[dir] ? (
                    <div className="flex items-center gap-2"><code className="truncate flex-1">{cuentaSel[dir]}</code><CopyButton text={cuentaSel[dir]} label="Copiar" /></div>
                  ) : <span style={lbl}>Sin dirección escrita</span>}
                </div>
              </div>
            ))}
            {WALLETS.every(([, , dir, qr]) => !cuentaSel[dir] && !cuentaSel[qr]) && <p className="text-xs" style={lbl}>Sin direcciones guardadas.</p>}
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
                {perfiles.filter((p) => !/\(extrabajador\)\s*$/i.test(p.full_name || '') || p.id === cform.profile_id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select></div>
            <div><label className="text-xs block mb-1" style={lbl}>Fecha de inicio</label><Input type="date" value={cform.fecha_inicio || ''} onChange={(e) => setCform({ ...cform, fecha_inicio: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>% habitual (0.15 = 15 %)</label><Input type="number" step="0.01" value={cform.pct_defecto} onChange={(e) => setCform({ ...cform, pct_defecto: e.target.value })} /></div>
            {WALLETS.map(([k, etiqueta, dir, qr]) => (
              <div key={k}>
                <label className="text-xs block mb-1" style={lbl}>Dirección {etiqueta}</label>
                <Input value={cform[dir] || ''} onChange={(e) => setCform({ ...cform, [dir]: e.target.value })} />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {cform[qr] && <img src={cform[qr]} alt={`QR ${etiqueta}`} style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 2 }} />}
                  <label className="text-xs px-2.5 py-1 rounded-md cursor-pointer" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                    {cform[qr] ? 'Cambiar QR' : '📷 Subir imagen del QR'}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = ''
                      if (!f) return
                      try { const d = await imagenAQr(f); setCform((c) => ({ ...c, [qr]: d })) } catch (err) { setMsg(err.message) }
                    }} />
                  </label>
                  {cform[qr] && <button type="button" className="text-xs hover:underline" style={{ color: 'var(--danger)' }} onClick={() => setCform({ ...cform, [qr]: null })}>Quitar QR</button>}
                </div>
              </div>
            ))}
            <label className="text-sm flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={cform.activa} onChange={(e) => setCform({ ...cform, activa: e.target.checked })} /> Cuenta activa</label>
            <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit">Guardar cuenta</Button><Button type="button" variant="ghost" onClick={() => setCform(null)}>Cancelar</Button></div>
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
              <div><label className="text-xs block mb-1" style={lbl}>Adelanto pagado (+)</label><Input type="number" step="0.01" value={form.adelanto} onChange={(e) => setF({ adelanto: e.target.value })} />
                </div>
              <div><label className="text-xs block mb-1" style={lbl}>Sanciones (se descuenta)</label><Input type="number" step="0.01" min="0" value={form.penalizacion} onChange={(e) => setF({ penalizacion: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Deuda a descontar (se resta)</label><Input type="number" step="0.01" min="0" value={form.deuda} onChange={(e) => setF({ deuda: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Estado</label>
                <Select value={form.estado} onChange={(e) => setF({ estado: e.target.value })}><option>Pendiente</option><option>Pagado</option></Select>
                <p className="text-[11px] mt-1" style={lbl}>Se guarda Pendiente hasta que confirmes el pago.</p></div>
              <div className="col-span-2"><label className="text-xs block mb-1" style={lbl}>Notas</label><Input value={form.notas} onChange={(e) => setF({ notas: e.target.value })} placeholder="Notas propias (los bonos y sanciones se añaden solos)" /></div>
            </div>
            {num(form.adelanto) > 0 && (!editId || num(form.adelanto) !== form.adelantoOriginal) && (
              <Fraccionador total={num(form.adelanto)} fechaBase={form.fecha} ancla={anclaPagos(pagos)} n={Number(form.cuotasN) || 2}
                setN={(k) => setF({ cuotasN: k })} filas={form.cuotasFilas} setFilas={(f) => setF({ cuotasFilas: f })} />
            )}
            {(() => {
              const pd = pendientesDe(form.account_id, form.fecha, editId)
              if (!pd.bonos.length && !pd.sanciones.length && !pd.cuotas.length) return null
              return (
                <div className="mt-4 grid gap-4 lg:grid-cols-3 sm:grid-cols-2">
                  {pd.bonos.length > 0 && (
                    <div className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Bonos que le corresponden en este pago</p>
                      {pd.bonos.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                          <input type="checkbox" checked={form.selB.includes(b.id)} onChange={() => alternarBono(b)} />
                          <span className="flex-1">{b.nombre} <span className="text-xs" style={lbl}>· cobro {fmtF(b.fecha_cobro)}</span>{b.created_at && <span className="block text-[11px]" style={lbl}>Añadido el {fmtAlta(b.created_at)}</span>}</span>
                          <strong className="tabular-nums">+{money(b.monto)}</strong>
                        </label>
                      ))}
                    </div>
                  )}
                  {pd.cuotas.length > 0 && (
                    <div className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--gold)' }}>Cuotas de adelantos a descontar</p>
                      {pd.cuotas.map((x) => {
                        const o = pagos.find((p) => p.id === x.origen_id)
                        return (
                          <label key={x.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                            <input type="checkbox" checked={form.selC.includes(x.id)} onChange={() => alternarCuota(x)} />
                            <span className="flex-1">Cuota {x.num}/{x.total}{o ? ` del adelanto del ${fmtF(o.fecha)}` : ''} <span className="text-xs" style={lbl}>· prevista {fmtF(x.fecha_prevista)}</span></span>
                            <strong className="tabular-nums" style={{ color: 'var(--danger)' }}>−{money(x.monto)}</strong>
                          </label>
                        )
                      })}
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
                {visibles.map((p, idx) => {
                  const celda = (v) => (num(v) ? money(v) : <span style={lbl}>—</span>)
                  // la línea es algo más gruesa cuando el siguiente pago es de otra fecha
                  const sig = visibles[idx + 1]
                  const cambiaFecha = !!sig && sig.fecha !== p.fecha
                  return (
                    <tr key={p.id} style={{ borderBottom: cambiaFecha ? '3px solid color-mix(in srgb, var(--text-muted) 55%, var(--border))' : '1px solid var(--border)' }}>
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
      {qrGrande && (
        <div onClick={() => setQrGrande(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="rounded-lg p-4 text-center" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm mb-3">{qrGrande.titulo}</p>
            <img src={qrGrande.src} alt="QR" style={{ width: 'min(80vw, 360px)', background: '#fff', padding: 8, borderRadius: 6 }} />
            <div className="mt-3"><Button variant="ghost" onClick={() => setQrGrande(null)}>Cerrar</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================================
// ADELANTOS: seguimiento de las cuotas pendientes de descontar
// =====================================================================================
function AdelantosTab({ cuentas, cuotas, pagos, onCambio }) {
  const lbl = { color: 'var(--text-muted)' }
  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const activas = cuentas.filter((c) => c.activa !== false)
  const ancla = useMemo(() => anclaPagos(pagos), [pagos])
  const [abierto, setAbierto] = useState(false)
  const [cuenta, setCuenta] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [n, setN] = useState(2)
  const [filas, setFilas] = useState([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // agrupa las cuotas por adelanto (el pago donde se entregó, o el adelanto creado a mano)
  const grupos = useMemo(() => {
    const m = {}
    cuotas.forEach((x) => { const k = x.origen_id || x.adelanto_id || x.id; (m[k] = m[k] || []).push(x) })
    return Object.entries(m).map(([clave, cs]) => {
      const o = pagos.find((p) => p.id === clave)
      const ordenadas = cs.sort((a, b) => a.num - b.num)
      return { clave, o, cs: ordenadas, total: r2(cs.reduce((t, x) => t + num(x.monto), 0)), fechaAdelanto: o?.fecha || cs[0].fecha_adelanto || cs[0].created_at?.slice(0, 10) || '', nota: cs[0].nota || '' }
    }).sort((a, b) => (b.fechaAdelanto || '').localeCompare(a.fechaAdelanto || ''))
  }, [cuotas, pagos])
  const porRecuperar = r2(cuotas.filter((x) => !x.aplicado_en).reduce((t, x) => t + num(x.monto), 0))

  async function crear(e) {
    e.preventDefault(); setError('')
    const total = num(monto)
    if (!cuenta) { setError('Elige al chatter.'); return }
    if (!(total > 0)) { setError('Indica el importe del adelanto.'); return }
    if (!filas.length || Math.abs(sumaCuotas(filas) - r2(total)) > 0.011) { setError('Las cuotas deben sumar exactamente el importe del adelanto.'); return }
    if (filas.some((f) => !f.fecha || !(num(f.monto) > 0))) { setError('Cada cuota necesita fecha e importe.'); return }
    setGuardando(true)
    const gid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
    const rows = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((f, i) => ({
      account_id: cuenta, origen_id: null, adelanto_id: gid, fecha_adelanto: fecha, nota: nota.trim() || null,
      num: i + 1, total: filas.length, monto: num(f.monto), fecha_prevista: f.fecha,
    }))
    const { error: err } = await supabase.from('payout_advance_installments').insert(rows)
    setGuardando(false)
    if (err) { setError(/adelanto_id|fecha_adelanto|nota|null value|origen_id/.test(err.message || '') ? 'Falta ejecutar la migración 62 en Supabase (adelantos manuales).' : 'No se pudo guardar: ' + err.message); return }
    setMonto(''); setNota(''); setFilas([]); setN(2); setAbierto(false); onCambio()
  }
  async function cancelarPendientes(g) {
    if (!confirm('¿Cancelar las cuotas pendientes de este adelanto? Las ya descontadas se mantienen.')) return
    const q = supabase.from('payout_advance_installments').delete().is('aplicado_en', null)
    await (g.cs[0].origen_id ? q.eq('origen_id', g.cs[0].origen_id) : g.cs[0].adelanto_id ? q.eq('adelanto_id', g.cs[0].adelanto_id) : q.eq('id', g.cs[0].id))
    onCambio()
  }
  async function cambiarFecha(x, fecha) {
    if (!fecha) return
    await supabase.from('payout_advance_installments').update({ fecha_prevista: fecha }).eq('id', x.id)
    onCambio()
  }

  return (
    <div>
      <Panel className="p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm" style={lbl}>Un adelanto se fracciona en cuotas con la fecha que elijas para cada una. Al registrar el pago de esa fecha, la cuota se descuenta sola en «Deuda». También se crean al guardar un pago con «Adelanto».</p>
            <p className="text-sm mt-2">Pendiente por recuperar: <strong className="gold-text tabular-nums">{money(porRecuperar)}</strong></p>
          </div>
          <Button onClick={() => { setAbierto(!abierto); setError(''); if (!cuenta && activas[0]) setCuenta(activas[0].id) }}>{abierto ? 'Cancelar' : '+ Nuevo adelanto'}</Button>
        </div>
      </Panel>

      {abierto && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">Nuevo adelanto</p>
          <form onSubmit={crear}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label className="text-xs block mb-1" style={lbl}>Chatter</label>
                <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)} required>
                  <option value="">Elegir…</option>
                  {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select></div>
              <div><label className="text-xs block mb-1" style={lbl}>Fecha del adelanto</label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Importe total ($)</label><Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} required /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Motivo / nota (opcional)</label><Input value={nota} onChange={(e) => setNota(e.target.value)} /></div>
            </div>
            {num(monto) > 0
              ? <Fraccionador total={num(monto)} fechaBase={fecha} ancla={ancla} n={n} setN={setN} filas={filas} setFilas={setFilas} />
              : <p className="text-xs mt-3" style={lbl}>Escribe el importe para elegir en cuántas veces se cobra y en qué fechas.</p>}
            {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="mt-4"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar adelanto'}</Button></div>
          </form>
        </Panel>
      )}

      {grupos.length === 0 ? <Panel className="p-6 text-sm text-center" style={lbl}>Todavía no hay adelantos. Pulsa «+ Nuevo adelanto» para crear el primero.</Panel> : grupos.map((g) => {
        const pend = g.cs.filter((x) => !x.aplicado_en).length
        return (
          <Panel key={g.clave} className="p-4 mb-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <p className="text-sm"><strong>{cuentaDe(g.cs[0].account_id)?.nombre}</strong> · adelanto de <strong className="tabular-nums">{money(g.total)}</strong> {g.fechaAdelanto ? <span style={lbl}>el {fmtF(g.fechaAdelanto)}</span> : null}{g.nota ? <span style={lbl}> · {g.nota}</span> : null}</p>
              {pend > 0 && <button onClick={() => cancelarPendientes(g)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Cancelar cuotas pendientes</button>}
            </div>
            {g.cs.map((x) => {
              const ap = x.aplicado_en ? pagos.find((p) => p.id === x.aplicado_en) : null
              return (
                <div key={x.id} className="flex items-center gap-3 py-1.5 text-sm flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                  <span style={lbl} className="w-16">Cuota {x.num}/{x.total}</span>
                  <span className="tabular-nums font-medium w-24">−{money(x.monto)}</span>
                  {x.aplicado_en
                    ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>Descontada{ap ? ` · pago ${fmtF(ap.fecha)}` : ''}</span>
                    : <>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pendiente</span>
                        <span className="text-xs ml-auto flex items-center gap-1" style={lbl}>prevista
                          <input type="date" value={x.fecha_prevista} onChange={(e) => cambiarFecha(x, e.target.value)} className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                        </span>
                      </>}
                </div>
              )
            })}
          </Panel>
        )
      })}
    </div>
  )
}

// =====================================================================================
// CALENDARIO: próximos pagos (lunes alternos) y cobro de bonos (días 1 y 16)
// =====================================================================================
function CalendarioTab({ cuentas, pagos, bonos, cuotas, onRegistrar, onVerPagos }) {
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
  const cuotasDia = dia ? cuotas.filter((x) => x.fecha_prevista === dia && !x.aplicado_en) : []

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
                const cs = cuotasDia.filter((x) => x.account_id === c.id)
                if (!pg && !det.pago && !bs.length && !cs.length) return null
                return (
                  <div key={c.id} className="flex items-center gap-2 py-2 text-sm flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-medium">{c.nombre}</span>
                    {bs.length > 0 && <span className="text-xs" style={lbl}>{bs.map((b) => `${b.nombre} +${money(b.monto)}`).join(', ')}</span>}
                    {cs.length > 0 && <span className="text-xs" style={{ color: 'var(--gold)' }}>{cs.map((x) => `cuota adelanto −${money(x.monto)}`).join(', ')}</span>}
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
function notasCompletas(p, bonos, sanciones, cuotas) {
  const partes = []
  if (p.notas) partes.push(p.notas)
  const b = (bonos || []).filter((x) => x.aplicado_en === p.id)
  if (b.length) partes.push('Bonos: ' + b.map((x) => `${x.nombre} (+${money(x.monto)})`).join(', '))
  const s = (sanciones || []).filter((x) => x.payout_id === p.id)
  if (s.length) partes.push('Sanciones: ' + s.map((x) => `${x.motivo}${num(x.monto) ? ` (−${money(x.monto).replace('−', '')})` : ''}`).join('; '))
  const c = (cuotas || []).filter((x) => x.aplicado_en === p.id)
  if (c.length) partes.push('Adelanto: ' + c.map((x) => `cuota ${x.num}/${x.total} (−${money(x.monto)})`).join(', '))
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
  const [aviso, setAviso] = useState('')
  const lbl = { color: 'var(--text-muted)' }
  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const nombres = [...new Set(bonos.map((b) => b.nombre))]

  function aplicarComun() { const m = {}; activas.forEach((c) => { m[c.id] = comun }); setMontos(m) }

  async function crear(e) {
    e.preventDefault(); setError('')
    const filas = activas.filter((c) => num(montos[c.id]) > 0).map((c) => ({ account_id: c.id, nombre: nombre.trim(), monto: num(montos[c.id]), fecha_cobro: fecha, nota: nota.trim() || null }))
    if (!nombre.trim()) { setError('Ponle un nombre al bono.'); return }
    if (!filas.length) { setError('Indica el importe de al menos un chatter.'); return }
    const { data: creados, error: err } = await supabase.from('payout_bonuses').insert(filas).select()
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    // Si ya hay un pago programado para esa fecha, el bono se suma solo a ese pago
    const avisos = []
    let sumados = 0
    for (const b of creados || []) {
      const pago = pagos.find((x) => x.account_id === b.account_id && x.fecha === b.fecha_cobro)
      if (!pago) continue
      if (pago.estado === 'Pagado') { avisos.push(`${cuentaDe(b.account_id)?.nombre}: el pago del ${fmtF(pago.fecha)} ya estaba pagado, el bono queda pendiente`); continue }
      const r1 = await supabase.from('payout_bonuses').update({ aplicado_en: pago.id }).eq('id', b.id)
      const r2_ = await supabase.from('chatter_payouts').update({ bonos: r2(num(pago.bonos) + num(b.monto)) }).eq('id', pago.id)
      if (r1.error || r2_.error) avisos.push(`${cuentaDe(b.account_id)?.nombre}: no se pudo sumar al pago del ${fmtF(pago.fecha)}`)
      else { sumados++; pago.bonos = r2(num(pago.bonos) + num(b.monto)) }
    }
    setNombre(''); setNota(''); setMontos({}); setComun('')
    setAviso([sumados ? `✓ ${sumados} ${sumados === 1 ? 'bono sumado' : 'bonos sumados'} automáticamente al pago ya programado de esa fecha.` : '', ...avisos].filter(Boolean).join(' · '))
    onCambio()
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
          {aviso && <p className="text-sm mt-3" style={{ color: 'var(--success)' }}>{aviso}</p>}
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
            <div className="col-span-2 lg:col-span-4 flex flex-wrap gap-2"><Button type="submit">Guardar</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></div>
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
                      <td className="px-3 py-2.5">{b.nombre}{b.created_at && <span className="block text-[11px]" style={lbl}>Añadido el {fmtAlta(b.created_at)}</span>}</td>
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
  const [cuotas, setCuotas] = useState([])
  useEffect(() => {
    Promise.all([
      supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }),
      supabase.from('payout_bonuses').select('*'),
      supabase.from('sanctions').select('id, motivo, monto, fecha, payout_id').not('payout_id', 'is', null),
      supabase.from('payout_advance_installments').select('*'),
    ]).then(([{ data: p }, { data: b }, { data: s }, { data: c }]) => { setFilas(p || []); setBonos(b || []); setSanciones(s || []); setCuotas(c || []) })
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
                    ['− Deuda / cuota de adelanto', money(p.deuda)],
                  ].filter(([, v], i) => i < 2 || v !== '$0.00').map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{k}</span><strong>{v}</strong></div>
                  ))}
                </div>
                {notasCompletas(p, bonos, sanciones, cuotas) && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{notasCompletas(p, bonos, sanciones, cuotas)}</p>}
              </Panel>
            ))}
          </>
        )}
    </div>
  )
}
