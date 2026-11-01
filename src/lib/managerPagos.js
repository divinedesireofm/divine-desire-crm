import { supabase } from './supabase'
import { getProfilesByRoles } from './roles'
import { cargarTareas, diasDelMes, isoDe } from './payTasks'

// ---- utilidades compartidas por «Pago de managers» y la tabla general de Pagos ----
export const r2 = (n) => Math.round(n * 100) / 100
import { num } from './numeros'
export { num }
export const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const aISO = (d) => d.toISOString().slice(0, 10)
export const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return aISO(d) }
export const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
export const pagoChatter = (p) => r2(num(p.fact_neta) * num(p.pct) + num(p.bonos) + num(p.adelanto) + num(p.penalizacion) + num(p.deuda))

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

// Configuración guardada de cada manager: manager_id -> { sueldo, inicio, fin, d1, d2 }
export function armarCfg(rows) {
  const g = {}
  ;(rows || []).forEach((r) => { g[r.manager_id] = { sueldo: num(r.monto_mensual), inicio: r.fecha_inicio || '', fin: r.fecha_fin || '', d1: r.dia_pago_1 || 16, d2: r.dia_pago_2 || 1 } })
  return g
}

// Carga todo lo necesario para calcular los pagos de los managers de unos roles
export async function cargarDatosManagers(roles) {
  const [managers, c, l, p, tk, aj, ca, pc, el] = await Promise.all([
    getProfilesByRoles(roles, { onlyActive: true }),
    supabase.from('manager_pay_config').select('*'),
    supabase.from('manager_days_off').select('*').limit(5000),
    supabase.from('manager_pay_periods').select('*').limit(5000),
    cargarTareas(),
    supabase.from('manager_pay_ajustes').select('*').limit(5000),
    supabase.from('payout_accounts').select('id, profile_id'),
    supabase.from('chatter_payouts').select('account_id, fecha, fact_neta, pct, bonos, adelanto, penalizacion, deuda, estado').order('fecha', { ascending: false }).limit(3000),
    supabase.from('manager_pay_eliminados').select('*').order('eliminado_at', { ascending: false }).limit(1000),
  ])
  return { managers, cfg: armarCfg(c.data), libresRows: l.data || [], pagos: p.data || [], tareas: tk.items || [], ajustes: aj.data || [], cuentasPago: ca.data || [], pagosChatter: pc.data || [], eliminados: el.error ? [] : (el.data || []), eliminadosError: !!el.error }
}

// Todos los pagos (fecha exacta + importe exacto) de cada manager en una ventana alrededor de hoy
export function calcularFilasManagers({ managers, cfg, libresRows, pagos, tareas, ajustes, cuentasPago, pagosChatter, eliminados = [] }, hoy) {
  const cfgDe = (id) => cfg[id] || { sueldo: 0, inicio: '', fin: '', d1: 16, d2: 1 }
  const libresDe = (id) => new Set(libresRows.filter((l) => l.manager_id === id).map((l) => l.fecha))
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
      if (eliminados.some((e) => e.manager_id === mg.id && e.fecha_pago === pr.pago)) return // eliminado (se puede restaurar)
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
}

// Una tarea pendiente solo cuelga del primer pago sin pagar
export function unicasTareas(filas) {
  const usadas = new Set()
  return filas.map((f) => {
    if (f.p) return f
    const tk = f.tk.filter((t) => !usadas.has(t.id))
    tk.forEach((t) => usadas.add(t.id))
    const sumaT = r2(tk.reduce((a, t) => a + num(t.monto), 0))
    return { ...f, tk, sumaT, total: r2(f.c.aPagar + sumaT + f.ajuste) }
  })
}

// Marca como pagado un pago de manager (guarda el importe exacto y enlaza sus tareas). Lo usan «Pago de managers» y la tabla general de Pagos.
export async function registrarPagoManager(f) {
  const { data, error } = await supabase.from('manager_pay_periods').upsert({
    manager_id: f.mg.id, fecha_pago: f.orig, fecha_pago_real: f.pr.pago !== f.orig ? f.pr.pago : null, periodo_desde: f.pr.desde, periodo_hasta: f.pr.hasta, nota: f.aj?.nota || null,
    importe_base: f.c.base, descuento: f.c.descuento, dias_descontados: f.c.libres, importe_tareas: f.sumaT, ajuste: f.ajuste, importe_pagado: f.total,
    pagado: true, pagado_at: new Date().toISOString(),
  }, { onConflict: 'manager_id,fecha_pago' }).select().single()
  if (error) return { error }
  if (f.tk.length) {
    const r = await supabase.from('pay_task_items').update({ aplicado_en: data.id, aplicado_tipo: 'manager', pagado_at: new Date().toISOString() }).in('id', f.tk.map((t) => t.id))
    if (r.error) return { data, aviso: 'El pago se guardó, pero no se pudieron enlazar las tareas: ' + r.error.message }
  }
  return { data }
}
