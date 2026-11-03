import { supabase } from './supabase'
import { num } from './numeros'

const r2 = (n) => Math.round(n * 100) / 100
const p2 = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`            // m = 1..12
const diasMes = (y, m) => new Date(y, m, 0).getDate()
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const hoyLocal = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()) }
const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Escalones válidos ordenados de menor a mayor: [{ desde, tipo: 'fijo' | 'pct', valor }]
export function escalonesOrdenados(escalones) {
  return (Array.isArray(escalones) ? escalones : [])
    .map((e) => ({ desde: num(e.desde), tipo: e.tipo === 'pct' ? 'pct' : 'fijo', valor: num(e.valor) }))
    .filter((e) => e.desde > 0 && e.valor > 0)
    .sort((a, b) => a.desde - b.desde)
}

// Se paga el escalón más alto alcanzado (no se suman). Devuelve { monto, idx (1 = el más bajo), escalon } o monto 0 si no llega a ninguno.
export function calcularBono(escalones, facturado) {
  const f = num(facturado)
  const es = escalonesOrdenados(escalones)
  let hit = -1
  es.forEach((e, i) => { if (f >= e.desde) hit = i })
  if (f <= 0 || hit < 0) return { monto: 0, idx: null, escalon: null }
  const e = es[hit]
  return { monto: r2(e.tipo === 'pct' ? f * e.valor / 100 : e.valor), idx: hit + 1, escalon: e }
}

export function textoEscalon(e) {
  return `desde ${money(e.desde)} → ${e.tipo === 'pct' ? e.valor + '% de lo facturado' : money(e.valor)}`
}
export function resumenEscalones(escalones) {
  const es = escalonesOrdenados(escalones)
  return es.length ? es.map((e) => `≥ ${money(e.desde)} → ${e.tipo === 'pct' ? e.valor + '%' : money(e.valor)}`).join(' · ') : 'Sin escalones'
}

// =====================================================================================
// REGLAS LIBRES: el admin define qué datos se introducen por chatter y qué condiciones dan qué pago
// =====================================================================================
export const OPERADORES = [['>=', 'es mayor o igual que'], ['>', 'es mayor que'], ['<=', 'es menor o igual que'], ['<', 'es menor que'], ['=', 'es igual a'], ['!=', 'es distinto de'], ['entre', 'está entre']]
export const TIPOS_PAGO = [['fijo', 'un importe fijo ($)'], ['pct', 'un % de un dato'], ['pct_exceso', 'un % de lo que pase de una cifra'], ['por_cada', 'un importe por cada X de un dato']]
export const CAMPO_FACTURADO = { id: 'facturado', nombre: 'Facturado ($)', tipo: 'dinero' }

export function camposDePlan(plan) {
  const c = Array.isArray(plan?.campos) ? plan.campos.filter((x) => x && x.id) : []
  return c.length ? c : [CAMPO_FACTURADO]
}
export const primerCampoDinero = (campos) => (campos.find((c) => c.tipo === 'dinero') || campos[0] || CAMPO_FACTURADO).id

// Los bonos creados con escalones (lote 93) se leen como reglas: de mayor a menor, se paga la primera que se cumpla
export function reglasDePlan(plan) {
  if (Array.isArray(plan?.reglas) && plan.reglas.length) return plan.reglas
  return escalonesOrdenados(plan?.escalones).reverse().map((e, i) => ({
    id: 'esc' + i, nombre: '', union: 'y',
    condiciones: [{ campo: 'facturado', op: '>=', valor: e.desde, valor2: null }],
    pago: { tipo: e.tipo === 'pct' ? 'pct' : 'fijo', valor: e.valor, campo: 'facturado', desde: 0, cada: 0 },
  }))
}
export const modoDePlan = (plan) => (plan?.reglas?.length ? plan.modo_reglas : 'primera') || 'primera'

const hayValor = (v) => v !== null && v !== undefined && String(v).trim() !== ''
export function condicionValida(c) { return !!c && !!c.campo && hayValor(c.valor) && (c.op !== 'entre' || hayValor(c.valor2)) }

export function cumple(c, datos) {
  const x = num(datos?.[c.campo]); const a = num(c.valor)
  switch (c.op) {
    case '>=': return x >= a
    case '>': return x > a
    case '<=': return x <= a
    case '<': return x < a
    case '=': return x === a
    case '!=': return x !== a
    case 'entre': { const b = num(c.valor2); return x >= Math.min(a, b) && x <= Math.max(a, b) }
    default: return false
  }
}

export function pagoRegla(pago, datos, campos) {
  if (!pago) return 0
  const v = num(pago.valor)
  const x = num(datos?.[pago.campo || primerCampoDinero(campos)])
  switch (pago.tipo) {
    case 'fijo': return r2(v)
    case 'pct': return r2(x * v / 100)
    case 'pct_exceso': return r2(Math.max(0, x - num(pago.desde)) * v / 100)
    case 'por_cada': { const cada = num(pago.cada); return cada > 0 ? r2(Math.floor(Math.max(0, x - num(pago.desde)) / cada) * v) : 0 }
    default: return 0
  }
}

// Calcula el bono de un chatter. datos = { idCampo: número }. Devuelve { monto, aplicadas: [{ idx, nombre, monto }], topado }
export function calcularPlan(plan, datos) {
  const campos = camposDePlan(plan); const reglas = reglasDePlan(plan); const modo = modoDePlan(plan)
  const aplicadas = []
  for (let i = 0; i < reglas.length; i++) {
    const r = reglas[i]
    const conds = (r.condiciones || []).filter(condicionValida)
    const ok = conds.length === 0 ? true : r.union === 'o' ? conds.some((c) => cumple(c, datos)) : conds.every((c) => cumple(c, datos))
    if (!ok) continue
    const m = pagoRegla(r.pago, datos, campos)
    if (m <= 0) continue
    aplicadas.push({ idx: i + 1, nombre: (r.nombre || '').trim() || `Regla ${i + 1}`, monto: m })
    if (modo === 'primera') break
  }
  let monto = r2(aplicadas.reduce((t, a) => t + a.monto, 0))
  let topado = false
  if (num(plan?.tope) > 0 && monto > num(plan.tope)) { monto = r2(num(plan.tope)); topado = true }
  return { monto, aplicadas, topado }
}

const fmtValor = (campo, v) => (campo?.tipo === 'dinero' ? money(v) : String(num(v)))
export function textoCondicion(c, campos) {
  const campo = campos.find((x) => x.id === c.campo)
  const op = { '>=': '≥', '>': '>', '<=': '≤', '<': '<', '=': '=', '!=': '≠' }[c.op]
  return c.op === 'entre' ? `${campo?.nombre || c.campo} entre ${fmtValor(campo, c.valor)} y ${fmtValor(campo, c.valor2)}` : `${campo?.nombre || c.campo} ${op} ${fmtValor(campo, c.valor)}`
}
export function textoPago(p, campos) {
  const nom = (id) => campos.find((x) => x.id === (id || primerCampoDinero(campos)))?.nombre || id
  switch (p?.tipo) {
    case 'fijo': return money(p.valor)
    case 'pct': return `${num(p.valor)}% de ${nom(p.campo)}`
    case 'pct_exceso': return `${num(p.valor)}% de lo que ${nom(p.campo)} pase de ${money(p.desde)}`
    case 'por_cada': return `${money(p.valor)} por cada ${num(p.cada)} de ${nom(p.campo)}${num(p.desde) ? ` (a partir de ${num(p.desde)})` : ''}`
    default: return '—'
  }
}
export function textoRegla(r, campos) {
  const conds = (r.condiciones || []).filter(condicionValida)
  const si = conds.length ? conds.map((c) => textoCondicion(c, campos)).join(r.union === 'o' ? ' o ' : ' y ') : 'siempre'
  return `Si ${si} → ${textoPago(r.pago, campos)}`
}
export function resumenPlan(plan) {
  const campos = camposDePlan(plan)
  return reglasDePlan(plan).map((r, i) => `${(r.nombre || '').trim() || 'Regla ' + (i + 1)}: ${textoRegla(r, campos)}`)
}

// Periodos de un bono, del más reciente (el actual) hacia atrás.
// mensual: mes natural · quincenal: 1-15 y 16-fin de mes. Cada uno: { clave, desde, hasta, etiqueta, enCurso }
export function periodosBono(periodicidad, hoy = hoyLocal(), n = 8) {
  let [y, m, d] = hoy.split('-').map(Number)
  const out = []
  if (periodicidad === 'mensual') {
    for (let i = 0; i < n; i++) {
      out.push({ desde: iso(y, m, 1), hasta: iso(y, m, diasMes(y, m)), etiqueta: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`, enCurso: i === 0 })
      m -= 1; if (m === 0) { m = 12; y -= 1 }
    }
  } else {
    let q = d <= 15 ? 1 : 2
    for (let i = 0; i < n; i++) {
      const fin = q === 1 ? 15 : diasMes(y, m)
      out.push({ desde: iso(y, m, q === 1 ? 1 : 16), hasta: iso(y, m, fin), etiqueta: `${q === 1 ? '1ª' : '2ª'} quincena de ${MESES[m - 1]} ${y} (${q === 1 ? '1–15' : '16–' + fin})`, enCurso: i === 0 })
      if (q === 2) q = 1; else { q = 2; m -= 1; if (m === 0) { m = 12; y -= 1 } }
    }
  }
  return out.map((p) => ({ ...p, clave: p.desde }))
}

// Fecha de pago por defecto de un periodo según la configuración del bono
export function fechaPagoPeriodo(plan, periodo) {
  const [y, m, d] = periodo.desde.split('-').map(Number)
  const siguiente = () => (m === 12 ? [y + 1, 1] : [y, m + 1])
  if (plan.periodicidad === 'mensual') {
    const [yy, mm] = siguiente()
    return iso(yy, mm, Math.min(num(plan.dia_pago_1) || 1, diasMes(yy, mm)))
  }
  if (d === 1) return iso(y, m, Math.min(num(plan.dia_pago_1) || 16, diasMes(y, m)))
  const [yy, mm] = siguiente()
  return iso(yy, mm, Math.min(num(plan.dia_pago_2) || 1, diasMes(yy, mm)))
}

// ---------- conexión con el cuadro general (misma lógica que los bonos manuales) ----------
// Suma un bono al pago que ya exista ese día para esa cuenta (incluso si estaba marcado como Pagado: se avisa).
export async function sumarBonoAPago(b) {
  const { data, error: e1 } = await supabase.from('chatter_payouts').select('id, account_id, fecha, bonos, estado').eq('account_id', b.account_id).eq('fecha', b.fecha_cobro)
  if (e1) return { ok: false, error: true }
  const cand = (data || []).filter((x) => x.account_id === b.account_id && x.fecha === b.fecha_cobro)
  let pago = cand.find((x) => x.estado !== 'Pagado') || cand[0]
  let creado = false
  if (!pago) {
    // No hay pago ese día: se crea uno solo con el bono para que salga en el cuadro general (luego puedes editarlo y añadir la facturación)
    const { data: cu } = await supabase.from('payout_accounts').select('id, pct_defecto').eq('id', b.account_id)
    const cuenta = (cu || []).find((x) => x.id === b.account_id)
    const ins = await supabase.from('chatter_payouts').insert([{ account_id: b.account_id, fecha: b.fecha_cobro, fact_neta: 0, pct: cuenta?.pct_defecto ?? null, bonos: 0, adelanto: 0, penalizacion: 0, deuda: 0, estado: 'Pendiente' }]).select().single()
    if (ins.error || !ins.data) return { ok: false, error: true }
    pago = ins.data; creado = true
  }
  const r1 = await supabase.from('payout_bonuses').update({ aplicado_en: pago.id }).eq('id', b.id)
  const r2_ = await supabase.from('chatter_payouts').update({ bonos: r2(num(pago.bonos) + num(b.monto)) }).eq('id', pago.id)
  if (r1.error || r2_.error) return { ok: false, error: true }
  return { ok: true, pagado: pago.estado === 'Pagado', creado }
}
// Quita un bono ya sumado del pago donde estaba
export async function restarBonoDePago(b) {
  if (!b?.aplicado_en) return
  const { data } = await supabase.from('chatter_payouts').select('*').eq('id', b.aplicado_en)
  const pago = (data || []).find((x) => x.id === b.aplicado_en)
  if (!pago) return
  const quedan = Math.max(0, r2(num(pago.bonos) - num(b.monto)))
  await supabase.from('chatter_payouts').update({ bonos: quedan }).eq('id', pago.id)
  // Si ese pago solo existía por este bono (todo a cero, sin nada más enlazado), se elimina para no dejar filas vacías
  const vacio = quedan === 0 && !num(pago.fact_neta) && !num(pago.fact_bruta) && !num(pago.adelanto) && !num(pago.penalizacion) && !num(pago.deuda) && !pago.notas && pago.estado !== 'Pagado'
  if (vacio) {
    const [o, c, t] = await Promise.all([
      supabase.from('payout_bonuses').select('id, aplicado_en').eq('aplicado_en', pago.id),
      supabase.from('payout_advance_installments').select('id, aplicado_en').eq('aplicado_en', pago.id),
      supabase.from('pay_task_items').select('id, aplicado_en').eq('aplicado_en', pago.id),
    ])
    const hay = [o, c, t].some((r) => r.error || (r.data || []).some((x) => x.aplicado_en === pago.id && x.id !== b.id))
    if (!hay) await supabase.from('chatter_payouts').delete().eq('id', pago.id)
  }
}
