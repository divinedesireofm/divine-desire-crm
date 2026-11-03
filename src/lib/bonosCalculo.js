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
  const pago = cand.find((x) => x.estado !== 'Pagado') || cand[0]
  if (!pago) return { ok: false }
  const r1 = await supabase.from('payout_bonuses').update({ aplicado_en: pago.id }).eq('id', b.id)
  const r2_ = await supabase.from('chatter_payouts').update({ bonos: r2(num(pago.bonos) + num(b.monto)) }).eq('id', pago.id)
  if (r1.error || r2_.error) return { ok: false, error: true }
  return { ok: true, pagado: pago.estado === 'Pagado' }
}
// Quita un bono ya sumado del pago donde estaba
export async function restarBonoDePago(b) {
  if (!b?.aplicado_en) return
  const { data } = await supabase.from('chatter_payouts').select('id, bonos').eq('id', b.aplicado_en)
  const pago = (data || []).find((x) => x.id === b.aplicado_en)
  if (!pago) return
  await supabase.from('chatter_payouts').update({ bonos: Math.max(0, r2(num(pago.bonos) - num(b.monto))) }).eq('id', pago.id)
}
