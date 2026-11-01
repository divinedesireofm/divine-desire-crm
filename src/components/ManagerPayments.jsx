import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input } from './ui'
import { getProfilesByRoles } from '../lib/roles'
import { cargarTareas, diasDelMes, isoDe, hoyISO } from '../lib/payTasks'

// ---- utilidades ----
const r2 = (n) => Math.round(n * 100) / 100
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const money = (n) => '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}` }
const fmtC = (s) => s.slice(8, 10) + '/' + s.slice(5, 7)
const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const aISO = (d) => d.toISOString().slice(0, 10)
const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return aISO(d) }
const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const ROLES_MANAGER = ['manager'] // solo managers de chatting
const lbl = { color: 'var(--text-muted)' }
const inp = { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }

// Fechas de pago de un manager entre dos fechas. Cada pago cubre desde el pago anterior hasta el día antes de este.
// (Con los días por defecto, 16 y 1: el día 16 se paga del 1 al 15 y el día 1 se paga del 16 al fin del mes anterior.)
export function periodosPago({ dia1 = 16, dia2 = 1 }, desde, hasta) {
  const [y0, m0] = desde.split('-').map(Number)
  const [y1, m1] = hasta.split('-').map(Number)
  const fechas = []
  let y = m0 === 1 ? y0 - 1 : y0, m = m0 === 1 ? 12 : m0 - 1
  const fin = y1 * 12 + m1 + 1
  while (y * 12 + m <= fin) {
    for (const d of [dia1, dia2]) fechas.push(isoDe(y, m, Math.min(Number(d) || 1, diasDelMes(y, m))))
    m++; if (m > 12) { m = 1; y++ }
  }
  const orden = [...new Set(fechas)].sort()
  const out = []
  for (let i = 1; i < orden.length; i++) if (orden[i] >= desde && orden[i] <= hasta) out.push({ pago: orden[i], desde: orden[i - 1], hasta: sumarDias(orden[i], -1) })
  return out
}

// Importe de un periodo: la mitad del sueldo mensual menos (mitad ÷ días del periodo) por cada día no trabajado
// (días marcados en el calendario + días fuera de contrato: antes de su inicio o después de su fin).
export function calcularPeriodo({ mensual, desde, hasta, libres = new Set(), inicio = null, fin = null }) {
  const dias = difDias(hasta, desde) + 1
  const base = r2(num(mensual) / 2)
  let sinFuncion = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    if (libres.has(f) || (inicio && f < inicio) || (fin && f > fin)) sinFuncion++
  }
  const descuento = Math.min(base, r2((dias ? base / dias : 0) * sinFuncion))
  return { base, dias, trabajados: dias - sinFuncion, libres: sinFuncion, descuento, aPagar: r2(base - descuento) }
}

export default function ManagerPayments() {
  const hoy = hoyISO()
  const [y, setY] = useState(Number(hoy.slice(0, 4)))
  const [m, setM] = useState(Number(hoy.slice(5, 7)))
  const [managers, setManagers] = useState([])
  const [cfg, setCfg] = useState({})         // manager_id -> { sueldo, inicio, fin, d1, d2 } guardado
  const [ed, setEd] = useState({})           // edición local (mismas claves, en texto)
  const [libresRows, setLibresRows] = useState([])
  const [pagos, setPagos] = useState([])
  const [tareas, setTareas] = useState([])   // cobros de tareas
  const [sel, setSel] = useState('')
  const [msg, setMsg] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const [profs, c, l, p, tk] = await Promise.all([
      getProfilesByRoles(ROLES_MANAGER, { onlyActive: true }),
      supabase.from('manager_pay_config').select('*'),
      supabase.from('manager_days_off').select('*').limit(5000),
      supabase.from('manager_pay_periods').select('*').limit(5000),
      cargarTareas(),
    ])
    setMsg(c.error || l.error || p.error ? 'Falta ejecutar las migraciones 72, 73 y 74 en Supabase (pagos de managers).' : '')
    setManagers(profs)
    const g = {}; (c.data || []).forEach((r) => { g[r.manager_id] = { sueldo: num(r.monto_mensual), inicio: r.fecha_inicio || '', fin: r.fecha_fin || '', d1: r.dia_pago_1 || 16, d2: r.dia_pago_2 || 1 } })
    setCfg(g)
    setEd((prev) => { const n = { ...prev }; profs.forEach((pr) => { if (!n[pr.id]) { const x = g[pr.id]; n[pr.id] = { sueldo: x ? String(x.sueldo) : '', inicio: x?.inicio || '', fin: x?.fin || '', d1: String(x?.d1 || 16), d2: String(x?.d2 || 1) } } }); return n })
    setLibresRows(l.data || []); setPagos(p.data || []); setTareas(tk.items || [])
    setSel((s) => s || profs[0]?.id || '')
    setCargando(false)
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line

  function mover(delta) { let nm = m + delta, ny = y; if (nm < 1) { nm = 12; ny-- } if (nm > 12) { nm = 1; ny++ } setM(nm); setY(ny) }
  const cfgDe = (id) => cfg[id] || { sueldo: 0, inicio: '', fin: '', d1: 16, d2: 1 }
  const libresDe = (id) => new Set(libresRows.filter((l) => l.manager_id === id).map((l) => l.fecha))

  async function guardarConfig(id) {
    const e = ed[id] || {}
    const d1 = Math.round(num(e.d1)), d2 = Math.round(num(e.d2))
    if (d1 < 1 || d1 > 28 || d2 < 1 || d2 > 28 || d1 === d2) return setMsg('Los días de pago deben ser dos días distintos entre el 1 y el 28.')
    const { error } = await supabase.from('manager_pay_config').upsert({ manager_id: id, monto_mensual: num(e.sueldo), fecha_inicio: e.inicio || null, fecha_fin: e.fin || null, dia_pago_1: d1, dia_pago_2: d2, updated_at: new Date().toISOString() })
    if (error) return setMsg(/fecha_inicio|dia_pago/.test(error.message) ? 'Falta ejecutar las migraciones 73 y 74 en Supabase.' : error.message)
    setMsg(''); setCfg((c) => ({ ...c, [id]: { sueldo: num(e.sueldo), inicio: e.inicio || '', fin: e.fin || '', d1, d2 } }))
  }
  const sinGuardar = (id) => { const e = ed[id] || {}, g = cfgDe(id); return num(e.sueldo) !== g.sueldo || (e.inicio || '') !== g.inicio || (e.fin || '') !== g.fin || Math.round(num(e.d1)) !== g.d1 || Math.round(num(e.d2)) !== g.d2 }

  async function alternarDia(id, fecha) {
    const ya = libresRows.find((l) => l.manager_id === id && l.fecha === fecha)
    const { error } = ya ? await supabase.from('manager_days_off').delete().eq('id', ya.id) : await supabase.from('manager_days_off').insert([{ manager_id: id, fecha }])
    if (error) return setMsg(error.message)
    cargar()
  }
  async function descontarRango(id) {
    if (!desde || !hasta || desde > hasta) return setMsg('Pon un rango válido (desde ≤ hasta).')
    const n = difDias(hasta, desde) + 1
    if (n > 62) return setMsg('El rango es demasiado largo (máximo 62 días).')
    const filas = Array.from({ length: n }, (_, i) => ({ manager_id: id, fecha: sumarDias(desde, i) }))
    const { error } = await supabase.from('manager_days_off').upsert(filas, { onConflict: 'manager_id,fecha', ignoreDuplicates: true })
    if (error) return setMsg(error.message)
    setDesde(''); setHasta(''); setMsg(''); cargar()
  }
  async function guardarMotivo(l, motivo) { await supabase.from('manager_days_off').update({ motivo: motivo.trim() || null }).eq('id', l.id) }

  // Todos los pagos (fecha exacta + importe exacto) de cada manager en una ventana amplia
  const filas = useMemo(() => {
    const ini = sumarDias(hoy, -120), fin = sumarDias(hoy, 70)
    const out = []
    managers.forEach((mg) => {
      const g = cfgDe(mg.id), libres = libresDe(mg.id)
      periodosPago({ dia1: g.d1, dia2: g.d2 }, ini, fin).forEach((pr) => {
        const fuera = (g.inicio && pr.hasta < g.inicio) || (g.fin && pr.desde > g.fin)
        const p = pagos.find((x) => x.manager_id === mg.id && x.fecha_pago === pr.pago)
        if (fuera && !p) return
        const c = calcularPeriodo({ mensual: g.sueldo, desde: pr.desde, hasta: pr.hasta, libres, inicio: g.inicio || null, fin: g.fin || null })
        // tareas: las pendientes (sin aplicar) con fecha de cobro ≤ fecha de este pago, o las ya incluidas en este pago
        const tk = tareas.filter((t) => t.responsable_id === mg.id && ((p && t.aplicado_en === p.id) || (!p && !t.aplicado_en && !t.pagado_at && t.fecha_pago <= pr.pago)))
        const sumaT = r2(tk.reduce((a, t) => a + num(t.monto), 0))
        out.push({ mg, pr, c, p, tk, sumaT, total: r2(c.aPagar + sumaT) })
      })
    })
    return out.sort((a, b) => a.pr.pago.localeCompare(b.pr.pago) || a.mg.full_name.localeCompare(b.mg.full_name))
  }, [managers, cfg, libresRows, pagos, tareas]) // eslint-disable-line

  // Tareas ya incluidas en un pago anterior no deben repetirse en filas futuras (las pendientes solo cuelgan del primer pago sin pagar)
  const filasUnicas = useMemo(() => {
    const usadas = new Set()
    return filas.map((f) => {
      if (f.p) return f
      const tk = f.tk.filter((t) => !usadas.has(t.id))
      tk.forEach((t) => usadas.add(t.id))
      const sumaT = r2(tk.reduce((a, t) => a + num(t.monto), 0))
      return { ...f, tk, sumaT, total: r2(f.c.aPagar + sumaT) }
    })
  }, [filas])

  const delMes = filasUnicas.filter((f) => f.pr.pago.startsWith(`${y}-${String(m).padStart(2, '0')}`))
  const urgentes = filasUnicas.filter((f) => !f.p?.pagado && f.pr.pago <= hoy && f.total > 0 && f.pr.pago >= sumarDias(hoy, -90))
  const hoyToca = urgentes.filter((f) => f.pr.pago === hoy)
  const atrasados = urgentes.filter((f) => f.pr.pago < hoy)
  const proximos = filasUnicas.filter((f) => !f.p?.pagado && f.pr.pago > hoy && f.total > 0).slice(0, 4)

  async function marcarPagado(f) {
    const { data, error } = await supabase.from('manager_pay_periods').upsert({
      manager_id: f.mg.id, fecha_pago: f.pr.pago, periodo_desde: f.pr.desde, periodo_hasta: f.pr.hasta,
      importe_base: f.c.base, descuento: f.c.descuento, dias_descontados: f.c.libres, importe_tareas: f.sumaT, importe_pagado: f.total,
      pagado: true, pagado_at: new Date().toISOString(),
    }, { onConflict: 'manager_id,fecha_pago' }).select().single()
    if (error) return setMsg(error.message)
    if (f.tk.length) {
      const r = await supabase.from('pay_task_items').update({ aplicado_en: data.id, aplicado_tipo: 'manager', pagado_at: new Date().toISOString() }).in('id', f.tk.map((t) => t.id))
      if (r.error) setMsg('El pago se guardó, pero no se pudieron enlazar las tareas: ' + r.error.message)
    }
    cargar()
  }
  async function deshacerPago(p) {
    await supabase.from('pay_task_items').update({ aplicado_en: null, aplicado_tipo: null, pagado_at: null }).eq('aplicado_en', p.id)
    const { error } = await supabase.from('manager_pay_periods').delete().eq('id', p.id)
    if (error) return setMsg(error.message)
    cargar()
  }

  // Calendario del manager seleccionado
  const libresSel = libresDe(sel)
  const gSel = cfgDe(sel)
  const pagosSel = new Set(sel ? periodosPago({ dia1: gSel.d1, dia2: gSel.d2 }, isoDe(y, m, 1), isoDe(y, m, diasDelMes(y, m))).map((x) => x.pago) : [])
  const primerDiaSemana = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const celdas = [...Array(primerDiaSemana).fill(null), ...Array.from({ length: diasDelMes(y, m) }, (_, i) => i + 1)]
  const selNombre = managers.find((x) => x.id === sel)?.full_name
  const listaLibresSel = libresRows.filter((l) => l.manager_id === sel && l.fecha.startsWith(`${y}-${String(m).padStart(2, '0')}`)).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const nombreDia = (s) => DIAS_SEMANA[aDate(s).getUTCDay()]

  if (cargando) return <p className="text-sm" style={lbl}>Cargando…</p>

  const Fila = ({ f, resaltar }) => {
    const pagado = !!f.p?.pagado
    const cambio = pagado && Math.abs(num(f.p.importe_pagado) - f.total) > 0.009
    return (
      <tr style={{ borderBottom: '1px solid var(--border)', background: resaltar ? 'var(--accent-soft)' : undefined }}>
        <td className="px-3 py-3 whitespace-nowrap"><strong>{fmtF(f.pr.pago)}</strong><span className="block text-xs" style={lbl}>{f.pr.pago === hoy ? 'HOY' : nombreDia(f.pr.pago)}</span></td>
        <td className="px-3 py-3 font-medium whitespace-nowrap">{f.mg.full_name}</td>
        <td className="px-3 py-3 whitespace-nowrap">{fmtC(f.pr.desde)} → {fmtC(f.pr.hasta)}<span className="block text-xs" style={lbl}>{f.c.dias} días</span></td>
        <td className="px-3 py-3 tabular-nums whitespace-nowrap">{pagado ? f.c.dias - f.p.dias_descontados : f.c.trabajados} de {f.c.dias}</td>
        <td className="px-3 py-3 tabular-nums" style={{ color: (pagado ? f.p.descuento : f.c.descuento) > 0 ? 'var(--danger)' : undefined }}>{(pagado ? f.p.descuento : f.c.descuento) > 0 ? '−' + money(pagado ? f.p.descuento : f.c.descuento) : '—'}</td>
        <td className="px-3 py-3 tabular-nums" title={f.tk.map((t) => `${t.titulo}: ${money(t.monto)}`).join('\n')}>{(pagado ? num(f.p.importe_tareas) : f.sumaT) > 0 ? '+' + money(pagado ? f.p.importe_tareas : f.sumaT) : '—'}{f.tk.length > 0 && <span className="block text-xs" style={lbl}>{f.tk.length} {f.tk.length === 1 ? 'tarea' : 'tareas'}</span>}</td>
        <td className="px-3 py-3 tabular-nums font-semibold whitespace-nowrap">{money(pagado ? f.p.importe_pagado : f.total)}{cambio && <span className="block text-xs font-normal" style={{ color: 'var(--gold)' }}>ahora saldría {money(f.total)}</span>}</td>
        <td className="px-3 py-3 whitespace-nowrap"><span style={{ color: pagado ? 'var(--success)' : f.pr.pago <= hoy ? 'var(--danger)' : 'var(--gold)' }}>{pagado ? '✓ Pagado' : f.pr.pago < hoy ? 'Atrasado' : f.pr.pago === hoy ? 'Toca hoy' : 'Pendiente'}</span></td>
        <td className="px-3 py-3 whitespace-nowrap">
          {pagado ? <button className="text-xs underline" style={lbl} onClick={() => { if (window.confirm('¿Deshacer este pago y volver a dejarlo pendiente?')) deshacerPago(f.p) }}>Deshacer</button>
            : <button className="text-xs underline" style={{ color: 'var(--accent)' }} disabled={!cfgDe(f.mg.id).sueldo && !f.sumaT} title={!cfgDe(f.mg.id).sueldo && !f.sumaT ? 'Primero pon su sueldo mensual' : ''} onClick={() => marcarPagado(f)}>Marcar pagado</button>}
        </td>
      </tr>
    )
  }
  const Cab = () => <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Fecha de pago', 'Manager', 'Periodo que paga', 'Días trabajados', 'Descuento', 'Tareas', 'Importe exacto', 'Estado', ''].map((c) => <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>

  return (
    <div className="space-y-5">
      {msg && <p className="text-sm" style={{ color: 'var(--danger)' }}>{msg}</p>}

      {/* Lo que toca ahora */}
      <Panel className="p-4">
        <p className="font-medium mb-2">{hoyToca.length ? `💸 Hoy (${fmtF(hoy)}) toca pagar` : 'Hoy no toca pagar a ningún manager'}</p>
        {hoyToca.map((f) => <p key={f.mg.id + f.pr.pago} className="text-sm py-0.5"><strong>{f.mg.full_name}</strong>: <strong className="gold-text tabular-nums">{money(f.total)}</strong> <span style={lbl}>· {f.c.trabajados} de {f.c.dias} días trabajados ({fmtC(f.pr.desde)} → {fmtC(f.pr.hasta)}){f.sumaT > 0 ? ` + ${money(f.sumaT)} de tareas` : ''}</span></p>)}
        {atrasados.length > 0 && (
          <div className="mt-2"><p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Atrasados sin pagar</p>
            {atrasados.map((f) => <p key={f.mg.id + f.pr.pago} className="text-sm py-0.5">{fmtF(f.pr.pago)} · <strong>{f.mg.full_name}</strong>: <strong className="tabular-nums">{money(f.total)}</strong></p>)}</div>
        )}
        {proximos.length > 0 && (
          <div className="mt-2"><p className="text-xs font-medium" style={lbl}>Próximos pagos</p>
            {proximos.map((f) => <p key={f.mg.id + f.pr.pago} className="text-xs py-0.5" style={lbl}>{fmtF(f.pr.pago)} ({nombreDia(f.pr.pago)}) · {f.mg.full_name}: <strong className="tabular-nums" style={{ color: 'var(--text)' }}>{money(f.total)}</strong> <span>(importe si no cambia nada)</span></p>)}</div>
        )}
      </Panel>

      <Panel>
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-medium mr-2">Pagos de</p>
          <button className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} onClick={() => mover(-1)}>◀</button>
          <p className="font-display font-semibold w-40 text-center capitalize">{MESES[m - 1]} {y}</p>
          <button className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} onClick={() => mover(1)}>▶</button>
          <button className="text-xs underline" style={lbl} onClick={() => { setY(Number(hoy.slice(0, 4))); setM(Number(hoy.slice(5, 7))) }}>Ir a este mes</button>
        </div>
        {managers.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay managers de chatting activos.</p>
          : delMes.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay pagos programados este mes (o aún no habían empezado a ejercer). El calendario de pagos está limitado a unos meses alrededor de hoy.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><Cab /><tbody>{delMes.map((f) => <Fila key={f.mg.id + f.pr.pago} f={f} resaltar={f.pr.pago === hoy} />)}</tbody></table></div>
          )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel className="p-4">
          <p className="font-medium mb-3">Sueldo, fechas de pago y de inicio de cada manager</p>
          <div className="space-y-4">
            {managers.map((mg) => {
              const e = ed[mg.id] || {}; const set = (patch) => setEd((x) => ({ ...x, [mg.id]: { ...(x[mg.id] || {}), ...patch } }))
              return (
                <div key={mg.id} className="rounded-md p-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex-1 text-sm font-medium">{mg.full_name}</span>
                    <div className="w-32"><Input type="number" min="0" step="0.01" placeholder="Sueldo/mes" value={e.sueldo ?? ''} onChange={(ev) => set({ sueldo: ev.target.value })} /></div>
                    <Button onClick={() => guardarConfig(mg.id)} disabled={!sinGuardar(mg.id)}>Guardar</Button>
                  </div>
                  <div className="flex items-end gap-3 flex-wrap mt-2">
                    <div><label className="text-xs block mb-1" style={lbl}>Se le paga el día…</label>
                      <div className="flex items-center gap-1.5"><input type="number" min="1" max="28" value={e.d1 ?? ''} onChange={(ev) => set({ d1: ev.target.value })} className="w-16 rounded-md px-2 py-1.5 text-sm" style={inp} /><span className="text-xs" style={lbl}>y el</span><input type="number" min="1" max="28" value={e.d2 ?? ''} onChange={(ev) => set({ d2: ev.target.value })} className="w-16 rounded-md px-2 py-1.5 text-sm" style={inp} /><span className="text-xs" style={lbl}>de cada mes</span></div></div>
                    <div><label className="text-xs block mb-1" style={lbl}>Empezó a ejercer el</label><input type="date" value={e.inicio || ''} onChange={(ev) => set({ inicio: ev.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                    <div><label className="text-xs block mb-1" style={lbl}>Dejó de ejercer el (opcional)</label><input type="date" value={e.fin || ''} onChange={(ev) => set({ fin: ev.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs mt-3" style={lbl}>Cada pago cubre desde el pago anterior hasta el día antes del pago (con 16 y 1: el 16 se paga del 1 al 15, y el 1 se paga del 16 al fin del mes anterior). Cada pago es la mitad del sueldo mensual; cada día sin función descuenta esa mitad ÷ los días del periodo. Los días antes de su inicio o después de su fin se descuentan solos. Los pagos ya marcados como pagados no cambian si modificas algo.</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="font-medium">Días sin función · {MESES[m - 1]} {y}</p>
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-md px-3 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {managers.map((mg) => <option key={mg.id} value={mg.id}>{mg.full_name}</option>)}
            </select>
          </div>
          {sel ? (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1" style={lbl}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d}>{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((d, i) => {
                  if (d === null) return <span key={'v' + i} />
                  const f = isoDe(y, m, d)
                  const fuera = (gSel.inicio && f < gSel.inicio) || (gSel.fin && f > gSel.fin)
                  if (fuera) return <span key={d} title="Fuera de contrato (antes de su inicio o después de su fin): se descuenta solo" className="rounded-md py-2 text-sm tabular-nums text-center" style={{ background: 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 4px, var(--border) 4px, var(--border) 5px)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>{d}</span>
                  const off = libresSel.has(f), pago = pagosSel.has(f)
                  return <button key={d} type="button" onClick={() => alternarDia(sel, f)} title={(pago ? 'Día de pago · ' : '') + (off ? 'Quitar descuento' : 'Marcar como día sin función')}
                    className="rounded-md py-2 text-sm tabular-nums" style={{ background: off ? 'var(--danger)' : 'var(--panel-alt)', color: off ? '#fff' : 'var(--text)', border: pago ? '2px solid var(--accent)' : '1px solid var(--border)', fontWeight: off || pago ? 700 : 400 }}>{d}</button>
                })}
              </div>
              <p className="text-xs mt-2" style={lbl}>Pulsa un día para descontarlo (rojo); otra vez para quitarlo. Borde dorado = día de pago · rayado = fuera de contrato (se descuenta solo).</p>
              <div className="flex items-end gap-2 mt-3 flex-wrap">
                <div><label className="text-xs block mb-1" style={lbl}>Rango desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <div><label className="text-xs block mb-1" style={lbl}>hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <Button onClick={() => descontarRango(sel)}>Descontar rango</Button>
              </div>
              {listaLibresSel.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs" style={lbl}>Días descontados a {selNombre} este mes ({listaLibresSel.length}) — puedes anotar el motivo:</p>
                  {listaLibresSel.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 tabular-nums">{fmtC(l.fecha)}</span>
                      <input defaultValue={l.motivo || ''} placeholder="Motivo (opcional)" onBlur={(e) => guardarMotivo(l, e.target.value)} className="flex-1 rounded-md px-2 py-1 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => alternarDia(sel, l.fecha)}>Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-sm" style={lbl}>No hay managers.</p>}
        </Panel>
      </div>
    </div>
  )
}
