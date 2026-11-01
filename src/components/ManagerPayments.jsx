import { Fragment, useEffect, useMemo, useState } from 'react'
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
export function calcularPeriodo({ mensual, desde, hasta, libres = new Set(), inicio = null, fin = null, baseOv = null, trabajadosOv = null, descuentoOv = null }) {
  const dias = difDias(hasta, desde) + 1
  const base = baseOv !== null && baseOv !== undefined ? r2(num(baseOv)) : r2(num(mensual) / 2)
  let sinFuncion = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    if (libres.has(f) || (inicio && f < inicio) || (fin && f > fin)) sinFuncion++
  }
  if (trabajadosOv !== null && trabajadosOv !== undefined) sinFuncion = Math.max(0, dias - Math.round(num(trabajadosOv)))
  const auto = Math.min(base, r2((dias ? base / dias : 0) * sinFuncion))
  const descuento = descuentoOv !== null && descuentoOv !== undefined ? r2(num(descuentoOv)) : auto
  return { base, dias, trabajados: dias - sinFuncion, libres: sinFuncion, descuento, aPagar: r2(base - descuento) }
}

// Tramos de calendario realmente trabajados dentro de un periodo (sin días marcados ni días fuera de contrato)
export function rangosTrabajados(desde, hasta, libres, inicio, fin) {
  const out = []; let ini = null, ult = null
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const no = libres.has(f) || (inicio && f < inicio) || (fin && f > fin)
    if (!no) { if (!ini) ini = f; ult = f } else if (ini) { out.push([ini, ult]); ini = null }
  }
  if (ini) out.push([ini, ult])
  return out
}
const textoRangos = (r) => (r.length ? r.map(([a, b]) => (a === b ? fmtC(a) : `${fmtC(a)} → ${fmtC(b)}`)).join(' · ') : 'ningún día')
const pagoChatter = (p) => r2(num(p.fact_neta) * num(p.pct) + num(p.bonos) + num(p.adelanto) + num(p.penalizacion) + num(p.deuda))

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
  const [ajustes, setAjustes] = useState([]) // ediciones manuales de periodos
  const [cuentasPago, setCuentasPago] = useState([]) // payout_accounts (para sumar su pago como chatter el mismo día)
  const [pagosChatter, setPagosChatter] = useState([])
  const [editando, setEditando] = useState(null) // { key, mgId, pago, desde, hasta, ajuste, nota }
  const [msg, setMsg] = useState('')
  const [rangoD, setRangoD] = useState('')
  const [rangoH, setRangoH] = useState('')
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const [profs, c, l, p, tk, aj, ca, pc] = await Promise.all([
      getProfilesByRoles(ROLES_MANAGER, { onlyActive: true }),
      supabase.from('manager_pay_config').select('*'),
      supabase.from('manager_days_off').select('*').limit(5000),
      supabase.from('manager_pay_periods').select('*').limit(5000),
      cargarTareas(),
      supabase.from('manager_pay_ajustes').select('*').limit(5000),
      supabase.from('payout_accounts').select('id, profile_id'),
      supabase.from('chatter_payouts').select('account_id, fecha, fact_neta, pct, bonos, adelanto, penalizacion, deuda, estado').order('fecha', { ascending: false }).limit(3000),
    ])
    setMsg(c.error || l.error || p.error ? 'Falta ejecutar las migraciones 72, 73 y 74 en Supabase (pagos de managers).' : aj.error ? 'Falta ejecutar la migración 75 en Supabase (editar periodos).' : '')
    setAjustes(aj.data || []); setCuentasPago(ca.data || []); setPagosChatter(pc.data || [])
    setManagers(profs)
    const g = {}; (c.data || []).forEach((r) => { g[r.manager_id] = { sueldo: num(r.monto_mensual), inicio: r.fecha_inicio || '', fin: r.fecha_fin || '', d1: r.dia_pago_1 || 16, d2: r.dia_pago_2 || 1 } })
    setCfg(g)
    setEd((prev) => { const n = { ...prev }; profs.forEach((pr) => { if (!n[pr.id]) { const x = g[pr.id]; n[pr.id] = { sueldo: x ? String(x.sueldo) : '', inicio: x?.inicio || '', fin: x?.fin || '', d1: String(x?.d1 || 16), d2: String(x?.d2 || 1) } } }); return n })
    setLibresRows(l.data || []); setPagos(p.data || []); setTareas(tk.items || [])
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

  // Todos los pagos (fecha exacta + importe exacto) de cada manager en una ventana amplia
  const filas = useMemo(() => {
    const ini = sumarDias(hoy, -120), fin = sumarDias(hoy, 70)
    const out = []
    managers.forEach((mg) => {
      const g = cfgDe(mg.id), libres = libresDe(mg.id)
      const ids = cuentasPago.filter((x) => x.profile_id === mg.id).map((x) => x.id)
      periodosPago({ dia1: g.d1, dia2: g.d2 }, ini, fin).forEach((pr) => {
        const fuera = (g.inicio && pr.hasta < g.inicio) || (g.fin && pr.desde > g.fin)
        const p = pagos.find((x) => x.manager_id === mg.id && x.fecha_pago === pr.pago)
        const aj = ajustes.find((x) => x.manager_id === mg.id && x.fecha_pago === pr.pago)
        if (fuera && !p && !aj) return
        const ctx = { libres, inicio: g.inicio || null, fin: g.fin || null }
        let per, c, sumaT, ajuste, tk, total, ahora = null
        if (p) { // ya pagado: manda lo guardado
          per = { pago: p.fecha_pago_real || p.fecha_pago, desde: p.periodo_desde || pr.desde, hasta: p.periodo_hasta || pr.hasta }
          const dias = difDias(per.hasta, per.desde) + 1
          c = { base: num(p.importe_base), dias, trabajados: dias - num(p.dias_descontados), libres: num(p.dias_descontados), descuento: num(p.descuento), aPagar: r2(num(p.importe_base) - num(p.descuento)) }
          sumaT = num(p.importe_tareas); ajuste = r2(num(p.ajuste)); total = num(p.importe_pagado)
          tk = tareas.filter((t) => t.aplicado_en === p.id)
          const cNow = calcularPeriodo({ mensual: g.sueldo, desde: per.desde, hasta: per.hasta, ...ctx })
          ahora = r2(cNow.aPagar + sumaT + ajuste)
        } else {
          per = { pago: aj?.fecha_pago_nueva || pr.pago, desde: aj?.periodo_desde || pr.desde, hasta: aj?.periodo_hasta || pr.hasta }
          c = calcularPeriodo({ mensual: g.sueldo, desde: per.desde, hasta: per.hasta, ...ctx, baseOv: aj?.base_manual, trabajadosOv: aj?.dias_trabajados_manual, descuentoOv: aj?.descuento_manual })
          ajuste = r2(num(aj?.ajuste))
          // tareas pendientes (sin aplicar) con día de cobro ≤ fecha de este pago
          tk = tareas.filter((t) => t.responsable_id === mg.id && !t.aplicado_en && !t.pagado_at && t.fecha_pago <= per.pago)
          sumaT = r2(tk.reduce((a, t) => a + num(t.monto), 0)); total = r2(c.aPagar + sumaT + ajuste)
        }
        const manualDias = !p && aj?.dias_trabajados_manual !== null && aj?.dias_trabajados_manual !== undefined
        const trabajado = manualDias ? null : rangosTrabajados(per.desde, per.hasta, libres, ctx.inicio, ctx.fin)
        // pago como chatter ese mismo día (si el manager también tiene cuenta de chatter)
        const otros = r2(pagosChatter.filter((x) => ids.includes(x.account_id) && x.fecha === per.pago).reduce((a, x) => a + pagoChatter(x), 0))
        out.push({ mg, orig: pr.pago, pr: per, c, p, aj, tk, sumaT, ajuste, trabajado, manualDias, otros, total, ahora })
      })
    })
    return out.sort((a, b) => a.pr.pago.localeCompare(b.pr.pago) || a.mg.full_name.localeCompare(b.mg.full_name))
  }, [managers, cfg, libresRows, pagos, tareas, ajustes, cuentasPago, pagosChatter]) // eslint-disable-line

  // Una tarea pendiente solo cuelga del primer pago sin pagar
  const filasUnicas = useMemo(() => {
    const usadas = new Set()
    return filas.map((f) => {
      if (f.p) return f
      const tk = f.tk.filter((t) => !usadas.has(t.id))
      tk.forEach((t) => usadas.add(t.id))
      const sumaT = r2(tk.reduce((a, t) => a + num(t.monto), 0))
      return { ...f, tk, sumaT, total: r2(f.c.aPagar + sumaT + f.ajuste) }
    })
  }, [filas])

  const delMes = filasUnicas.filter((f) => f.pr.pago.startsWith(`${y}-${String(m).padStart(2, '0')}`))
  const urgentes = filasUnicas.filter((f) => !f.p?.pagado && f.pr.pago <= hoy && f.total > 0 && f.pr.pago >= sumarDias(hoy, -90))
  const hoyToca = urgentes.filter((f) => f.pr.pago === hoy)
  const atrasados = urgentes.filter((f) => f.pr.pago < hoy)
  const proximos = filasUnicas.filter((f) => !f.p?.pagado && f.pr.pago > hoy && f.total > 0).slice(0, 4)

  async function marcarPagado(f) {
    const { data, error } = await supabase.from('manager_pay_periods').upsert({
      manager_id: f.mg.id, fecha_pago: f.orig, fecha_pago_real: f.pr.pago !== f.orig ? f.pr.pago : null, periodo_desde: f.pr.desde, periodo_hasta: f.pr.hasta, nota: f.aj?.nota || null,
      importe_base: f.c.base, descuento: f.c.descuento, dias_descontados: f.c.libres, importe_tareas: f.sumaT, ajuste: f.ajuste, importe_pagado: f.total,
      pagado: true, pagado_at: new Date().toISOString(),
    }, { onConflict: 'manager_id,fecha_pago' }).select().single()
    if (error) return setMsg(error.message)
    if (f.tk.length) {
      const r = await supabase.from('pay_task_items').update({ aplicado_en: data.id, aplicado_tipo: 'manager', pagado_at: new Date().toISOString() }).in('id', f.tk.map((t) => t.id))
      if (r.error) setMsg('El pago se guardó, pero no se pudieron enlazar las tareas: ' + r.error.message)
    }
    cargar()
  }
  // Cálculo automático de un periodo para este manager (con sus fechas de contrato y días sin función)
  function autoCalc(mgId, desde, hasta) { const g = cfgDe(mgId); return calcularPeriodo({ mensual: g.sueldo, desde, hasta, libres: libresDe(mgId), inicio: g.inicio || null, fin: g.fin || null }) }
  const descAutoDe = (base, desde, hasta, trab) => { const dias = difDias(hasta, desde) + 1; return Math.min(num(base), r2(dias > 0 ? (num(base) / dias) * Math.max(0, dias - Math.round(num(trab))) : 0)) }
  // Días fuera de contrato (antes de su inicio / después de su fin): no se pueden marcar como trabajados desde aquí
  const fueraContrato = (mgId, d) => { const g = cfgDe(mgId); return !!((g.inicio && d < g.inicio) || (g.fin && d > g.fin)) }
  const diasDe = (desde, hasta) => { const o = []; if (!desde || !hasta || desde > hasta || difDias(hasta, desde) > 120) return o; for (let d = desde; d <= hasta; d = sumarDias(d, 1)) o.push(d); return o }
  const trabDesdeSet = (e) => diasDe(e.desde, e.hasta).filter((d) => !fueraContrato(e.mgId, d) && !e.libres.includes(d)).length
  function abrirEdicion(f) {
    const cNow = f.c
    const libresIni = [...libresDe(f.mg.id)].filter((d) => d >= f.pr.desde && d <= f.pr.hasta)
    const derivado = diasDe(f.pr.desde, f.pr.hasta).filter((d) => !fueraContrato(f.mg.id, d) && !libresIni.includes(d)).length
    setEditando({ key: f.mg.id + f.orig, mgId: f.mg.id, orig: f.orig, pagado: !!f.p, pId: f.p?.id || null, fecha: f.pr.pago, desde: f.pr.desde, hasta: f.pr.hasta,
      libres: libresIni, base: String(cNow.base), trabajados: String(cNow.trabajados), descuento: String(cNow.descuento), descAuto: f.p ? Math.abs(cNow.descuento - descAutoDe(cNow.base, f.pr.desde, f.pr.hasta, cNow.trabajados)) < 0.01 : f.aj?.descuento_manual == null,
      baseManual: !!f.p || f.aj?.base_manual != null, trabManual: cNow.trabajados !== derivado,
      tareas: String(f.sumaT || ''), sumaTpend: f.sumaT, ajuste: f.ajuste ? String(f.ajuste) : '', nota: f.p?.nota || f.aj?.nota || '', hay: !!f.aj })
  }
  function cambiar(patch) {
    setEditando((e0) => {
      const e = { ...e0, ...patch }
      const rangoOk = e.desde && e.hasta && e.desde <= e.hasta
      if (('desde' in patch || 'hasta' in patch) && rangoOk) {
        // días sin función dentro del nuevo rango: los marcados aquí que siguen dentro + los ya guardados en días que antes no estaban en el rango
        const dentroAntes = new Set(diasDe(e0.desde, e0.hasta))
        const nuevos = [...libresDe(e.mgId)].filter((d) => d >= e.desde && d <= e.hasta && !dentroAntes.has(d))
        e.libres = [...new Set([...e.libres.filter((d) => d >= e.desde && d <= e.hasta), ...nuevos])]
        const c = autoCalc(e.mgId, e.desde, e.hasta)
        if (!e.baseManual) e.base = String(c.base)
        if (!e.trabManual) e.trabajados = String(trabDesdeSet(e))
      }
      if ('libres' in patch) { e.trabManual = false; e.trabajados = String(trabDesdeSet(e)) } // al tocar el calendario manda el calendario
      if ('trabajados' in patch) e.trabManual = true
      if ('base' in patch) e.baseManual = true
      if ('descuento' in patch) e.descAuto = false
      if (e.descAuto && rangoOk) e.descuento = String(descAutoDe(e.base, e.desde, e.hasta, e.trabajados))
      return e
    })
  }
  function alternarDiaEdicion(d) {
    if (fueraContrato(editando.mgId, d)) return
    cambiar({ libres: editando.libres.includes(d) ? editando.libres.filter((x) => x !== d) : [...editando.libres, d] })
  }
  const totalEdicion = (e) => r2(num(e.base) - num(e.descuento) + (e.pagado ? num(e.tareas) : num(e.sumaTpend)) + num(e.ajuste))
  async function guardarEdicion() {
    const e = editando
    if (!e.fecha) return setMsg('Pon la fecha de pago.')
    if (!e.desde || !e.hasta || e.desde > e.hasta) return setMsg('El periodo no es válido: «desde» debe ser anterior o igual a «hasta».')
    const dias = difDias(e.hasta, e.desde) + 1
    const trab = Math.min(dias, Math.max(0, Math.round(num(e.trabajados))))
    // Los días de trabajo editados en el calendario se guardan también como días sin función del manager (el calendario general los refleja)
    const previos = libresRows.filter((l) => l.manager_id === e.mgId && l.fecha >= e.desde && l.fecha <= e.hasta)
    const aBorrar = previos.filter((l) => !e.libres.includes(l.fecha)).map((l) => l.id)
    const yaOff = new Set(previos.map((l) => l.fecha))
    const aAnadir = e.libres.filter((d) => !yaOff.has(d)).map((d) => ({ manager_id: e.mgId, fecha: d }))
    if (aBorrar.length) { const r = await supabase.from('manager_days_off').delete().in('id', aBorrar); if (r.error) return setMsg(r.error.message) }
    if (aAnadir.length) { const r = await supabase.from('manager_days_off').upsert(aAnadir, { onConflict: 'manager_id,fecha', ignoreDuplicates: true }); if (r.error) return setMsg(r.error.message) }
    if (e.pagado) {
      const { error } = await supabase.from('manager_pay_periods').update({
        fecha_pago_real: e.fecha !== e.orig ? e.fecha : null, periodo_desde: e.desde, periodo_hasta: e.hasta, importe_base: r2(num(e.base)), descuento: r2(num(e.descuento)),
        dias_descontados: dias - trab, importe_tareas: r2(num(e.tareas)), ajuste: r2(num(e.ajuste)), importe_pagado: totalEdicion(e), nota: e.nota.trim() || null, editado: true,
      }).eq('id', e.pId)
      if (error) return setMsg(error.message.includes('fecha_pago_real') || error.message.includes('editado') ? 'Falta ejecutar la migración 76 en Supabase.' : error.message)
    } else {
      // solo se guarda como «manual» lo que se aparta de lo que saldría automáticamente
      const auto = autoCalc(e.mgId, e.desde, e.hasta) // (la base no depende de los días)
      const baseM = r2(num(e.base)) !== auto.base ? r2(num(e.base)) : null
      const trabM = trab !== trabDesdeSet(e) ? trab : null
      const descAuto = descAutoDe(e.base, e.desde, e.hasta, e.trabajados)
      const descM = r2(num(e.descuento)) !== r2(descAuto) ? r2(num(e.descuento)) : null
      const { error } = await supabase.from('manager_pay_ajustes').upsert({
        manager_id: e.mgId, fecha_pago: e.orig, fecha_pago_nueva: e.fecha !== e.orig ? e.fecha : null, periodo_desde: e.desde, periodo_hasta: e.hasta,
        base_manual: baseM, dias_trabajados_manual: trabM, descuento_manual: descM, ajuste: r2(num(e.ajuste)), nota: e.nota.trim() || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'manager_id,fecha_pago' })
      if (error) return setMsg(/manager_pay_ajustes/.test(error.message) ? 'Falta ejecutar las migraciones 75 y 76 en Supabase.' : /fecha_pago_nueva|base_manual|manual/.test(error.message) ? 'Falta ejecutar la migración 76 en Supabase.' : error.message)
    }
    setEditando(null); setMsg(''); cargar()
  }
  async function restablecerEdicion() {
    await supabase.from('manager_pay_ajustes').delete().eq('manager_id', editando.mgId).eq('fecha_pago', editando.orig)
    setEditando(null); cargar()
  }
  async function deshacerPago(p) {
    await supabase.from('pay_task_items').update({ aplicado_en: null, aplicado_tipo: null, pagado_at: null }).eq('aplicado_en', p.id)
    const { error } = await supabase.from('manager_pay_periods').delete().eq('id', p.id)
    if (error) return setMsg(error.message)
    cargar()
  }

  const nombreDia = (s) => DIAS_SEMANA[aDate(s).getUTCDay()]

  if (cargando) return <p className="text-sm" style={lbl}>Cargando…</p>

  const Fila = ({ f, resaltar }) => {
    const pagado = !!f.p?.pagado
    const cambio = pagado && !f.p.editado && f.ahora !== null && Math.abs(f.ahora - f.total) > 0.009
    const key = f.mg.id + f.orig
    const abierto = editando?.key === key
    const ed2 = cambiar
    return (
      <>
      <tr style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', background: resaltar ? 'var(--accent-soft)' : undefined }}>
        <td className="px-3 py-3 whitespace-nowrap"><strong>{fmtF(f.pr.pago)}</strong><span className="block text-xs" style={lbl}>{f.pr.pago === hoy ? 'HOY' : nombreDia(f.pr.pago)}</span></td>
        <td className="px-3 py-3 font-medium whitespace-nowrap">{f.mg.full_name}</td>
        <td className="px-3 py-3 whitespace-nowrap">{fmtC(f.pr.desde)} → {fmtC(f.pr.hasta)}<span className="block text-xs" style={lbl}>{f.c.dias} días{(f.aj && !pagado) || f.p?.editado ? ' · editado' : ''}</span></td>
        <td className="px-3 py-3 tabular-nums"><span className="whitespace-nowrap">{f.c.trabajados} de {f.c.dias}</span><span className="block text-xs" style={lbl}>{f.manualDias ? 'Días fijados a mano' : <>Trabajó: {textoRangos(f.trabajado)}</>}</span></td>
        <td className="px-3 py-3 tabular-nums" style={{ color: f.c.descuento > 0 ? 'var(--danger)' : undefined }}>{f.c.descuento > 0 ? '−' + money(f.c.descuento) : '—'}</td>
        <td className="px-3 py-3 tabular-nums" title={f.tk.map((t) => `${t.titulo}: ${money(t.monto)}`).join('\n')}>{f.sumaT > 0 ? '+' + money(f.sumaT) : '—'}{f.tk.length > 0 && <span className="block text-xs" style={lbl}>{f.tk.length} {f.tk.length === 1 ? 'tarea' : 'tareas'}</span>}</td>
        <td className="px-3 py-3 tabular-nums font-semibold whitespace-nowrap">
          {money(f.total)}
          {f.ajuste !== 0 && <span className="block text-xs font-normal" style={lbl}>incluye ajuste {f.ajuste > 0 ? '+' : '−'}{money(f.ajuste)}</span>}
          {cambio && <span className="block text-xs font-normal" style={{ color: 'var(--gold)' }}>ahora saldría {money(f.total)}</span>}
          {f.otros > 0 && <span className="block text-xs font-normal" style={{ color: 'var(--accent)' }}>+ {money(f.otros)} como chatter · total del día {money(f.total + f.otros)}</span>}
        </td>
        <td className="px-3 py-3 whitespace-nowrap"><span style={{ color: pagado ? 'var(--success)' : f.pr.pago <= hoy ? 'var(--danger)' : 'var(--gold)' }}>{pagado ? '✓ Pagado' : f.pr.pago < hoy ? 'Atrasado' : f.pr.pago === hoy ? 'Toca hoy' : 'Pendiente'}</span></td>
        <td className="px-3 py-3 whitespace-nowrap space-x-3">
          <button className="text-xs underline" style={lbl} onClick={() => (abierto ? setEditando(null) : abrirEdicion(f))}>{abierto ? 'Cerrar' : 'Editar'}</button>
          {pagado ? <button className="text-xs underline" style={lbl} onClick={() => { if (window.confirm('¿Deshacer este pago y volver a dejarlo pendiente?')) deshacerPago(f.p) }}>Deshacer</button>
            : <button className="text-xs underline" style={{ color: 'var(--accent)' }} disabled={!cfgDe(f.mg.id).sueldo && !f.sumaT && !f.ajuste} title={!cfgDe(f.mg.id).sueldo && !f.sumaT && !f.ajuste ? 'Primero pon su sueldo mensual' : ''} onClick={() => marcarPagado(f)}>Marcar pagado</button>}
        </td>
      </tr>
      {abierto && (
        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel-alt)' }}>
          <td colSpan={9} className="px-4 py-4">
            <p className="text-xs mb-3" style={lbl}>Editar este pago de {f.mg.full_name} (pago original del {fmtF(f.orig)}){pagado ? ' · ya está marcado como pagado: lo que cambies sustituye lo guardado' : ''}. Puedes cambiar cualquier dato.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className="text-xs block mb-1" style={lbl}>Fecha de pago</label><input type="date" value={editando.fecha} onChange={(ev) => ed2({ fecha: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Periodo desde</label><input type="date" value={editando.desde} onChange={(ev) => ed2({ desde: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Periodo hasta</label><input type="date" value={editando.hasta} onChange={(ev) => ed2({ hasta: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Días trabajados (de {editando.desde && editando.hasta && editando.desde <= editando.hasta ? difDias(editando.hasta, editando.desde) + 1 : '—'})</label><input type="number" min="0" value={editando.trabajados} onChange={(ev) => ed2({ trabajados: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Importe base ($)</label><input type="number" step="0.01" value={editando.base} onChange={(ev) => ed2({ base: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Descuento ($){editando.descAuto ? ' · automático' : ' · manual'}</label><input type="number" step="0.01" value={editando.descuento} onChange={(ev) => ed2({ descuento: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              {pagado ? <div><label className="text-xs block mb-1" style={lbl}>Tareas ($)</label><input type="number" step="0.01" value={editando.tareas} onChange={(ev) => ed2({ tareas: ev.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                : <div><label className="text-xs block mb-1" style={lbl}>Tareas ($, automático)</label><div className="rounded-md px-2 py-1.5 text-sm" style={{ ...inp, opacity: 0.7 }}>{money(editando.sumaTpend)}</div></div>}
              <div><label className="text-xs block mb-1" style={lbl}>Ajuste manual ($, + suma / − resta)</label><input type="number" step="0.01" value={editando.ajuste} onChange={(ev) => ed2({ ajuste: ev.target.value })} placeholder="0.00" className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div className="col-span-2 md:col-span-4"><label className="text-xs block mb-1" style={lbl}>Nota (opcional)</label><input value={editando.nota} onChange={(ev) => ed2({ nota: ev.target.value })} placeholder="Motivo de los cambios" className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
            </div>
            {editando.desde && editando.hasta && editando.desde <= editando.hasta && difDias(editando.hasta, editando.desde) <= 120 && (
              <div className="mt-4">
                <p className="text-xs mb-2" style={lbl}>Días de trabajo exactos del periodo — pulsa un día para marcarlo como <strong>no trabajado</strong> (rojo) o trabajado (verde). Los días y el descuento se recalculan solos.</p>
                <div className="flex flex-wrap gap-1">
                  {diasDe(editando.desde, editando.hasta).map((d) => {
                    const fuera = fueraContrato(editando.mgId, d), off = editando.libres.includes(d)
                    return (
                      <button key={d} type="button" disabled={fuera} onClick={() => alternarDiaEdicion(d)} title={fuera ? 'Fuera de contrato (cambia su fecha de inicio/fin arriba)' : (off ? 'No trabajado: pulsa para marcarlo trabajado' : 'Trabajado: pulsa para marcarlo no trabajado')}
                        className="rounded-md px-1.5 py-1 text-center tabular-nums" style={{ minWidth: 44, fontSize: 11, lineHeight: 1.2, background: fuera ? 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 4px, var(--border) 4px, var(--border) 5px)' : off ? 'var(--danger)' : 'var(--accent-soft)', color: off ? '#fff' : 'var(--text)', border: '1px solid ' + (fuera ? 'var(--border)' : off ? 'var(--danger)' : 'var(--success)'), cursor: fuera ? 'not-allowed' : 'pointer' }}>
                        <span className="block" style={{ opacity: 0.7 }}>{DIAS_SEMANA[aDate(d).getUTCDay()].slice(0, 2)}</span><strong>{d.slice(8, 10)}/{d.slice(5, 7)}</strong>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" style={lbl}>
                  <span>Trabajó: <strong style={{ color: 'var(--text)' }}>{textoRangos(rangosTrabajados(editando.desde, editando.hasta, new Set(editando.libres), cfgDe(editando.mgId).inicio || null, cfgDe(editando.mgId).fin || null))}</strong></span>
                  <span className="inline-flex items-center gap-1">Marcar como no trabajado del
                    <input type="date" value={rangoD} min={editando.desde} max={editando.hasta} onChange={(ev) => setRangoD(ev.target.value)} className="rounded px-1.5 py-0.5" style={inp} /> al
                    <input type="date" value={rangoH} min={editando.desde} max={editando.hasta} onChange={(ev) => setRangoH(ev.target.value)} className="rounded px-1.5 py-0.5" style={inp} />
                    <button type="button" className="underline" onClick={() => { if (!rangoD || !rangoH || rangoD > rangoH) return; const nuevos = diasDe(rangoD, rangoH).filter((d) => d >= editando.desde && d <= editando.hasta && !fueraContrato(editando.mgId, d)); ed2({ libres: [...new Set([...editando.libres, ...nuevos])] }); setRangoD(''); setRangoH('') }}>Aplicar</button>
                  </span>
                  <button type="button" className="underline" onClick={() => ed2({ libres: [] })}>Marcar todos trabajados</button>
                  <button type="button" className="underline" onClick={() => ed2({ libres: diasDe(editando.desde, editando.hasta).filter((d) => !fueraContrato(editando.mgId, d)) })}>Marcar ninguno</button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap mt-3">
              <p className="text-sm">Total a pagar: <strong className="gold-text tabular-nums">{money(totalEdicion(editando))}</strong></p>
              <Button onClick={guardarEdicion}>Guardar cambios</Button>
              <button className="text-xs underline" style={lbl} onClick={() => { const c = autoCalc(editando.mgId, editando.desde, editando.hasta); setEditando((e) => ({ ...e, libres: [...libresDe(e.mgId)].filter((d) => d >= e.desde && d <= e.hasta), trabManual: false, baseManual: false, descAuto: true, base: String(c.base), trabajados: String(c.trabajados), descuento: String(c.descuento) })) }}>Volver a los días, base y descuento originales</button>
              {editando.hay && !pagado && <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={restablecerEdicion}>Restablecer todo al original</button>}
            </div>
          </td>
        </tr>
      )}
      </>
    )
  }
  const Cab = () => <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Fecha de pago', 'Manager', 'Periodo que paga', 'Días trabajados', 'Descuento', 'Tareas', 'Importe exacto', 'Estado', ''].map((c) => <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>

  return (
    <div className="space-y-5">
      {msg && <p className="text-sm" style={{ color: 'var(--danger)' }}>{msg}</p>}

      {/* Lo que toca ahora */}
      <Panel className="p-4">
        <p className="font-medium mb-2">{hoyToca.length ? `💸 Hoy (${fmtF(hoy)}) toca pagar` : 'Hoy no toca pagar a ningún manager'}</p>
        {hoyToca.map((f) => <p key={f.mg.id + f.pr.pago} className="text-sm py-0.5"><strong>{f.mg.full_name}</strong>: <strong className="gold-text tabular-nums">{money(f.total)}</strong> <span style={lbl}>· {f.c.trabajados} de {f.c.dias} días trabajados (periodo {fmtC(f.pr.desde)} → {fmtC(f.pr.hasta)}; trabajó {f.manualDias ? 'días fijados a mano' : textoRangos(f.trabajado)}){f.sumaT > 0 ? ` + ${money(f.sumaT)} de tareas` : ''}{f.ajuste ? ` · ajuste ${f.ajuste > 0 ? '+' : '−'}${money(f.ajuste)}` : ''}</span>{f.otros > 0 && <span className="block text-xs" style={{ color: 'var(--accent)' }}>Ese mismo día también cobra {money(f.otros)} como chatter → total del día: <strong>{money(f.total + f.otros)}</strong></span>}</p>)}
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
            <div className="overflow-x-auto"><table className="w-full text-sm"><Cab /><tbody>{delMes.map((f) => <Fragment key={f.mg.id + f.pr.pago}>{Fila({ f, resaltar: f.pr.pago === hoy })}</Fragment>)}</tbody></table></div>
          )}
      </Panel>

      <div>
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

      </div>
    </div>
  )
}
