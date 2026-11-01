import { supabase } from './supabase'

const pad = (n) => String(n).padStart(2, '0')
export const diasDelMes = (y, m) => new Date(y, m, 0).getDate() // m = 1..12
export const isoDe = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const hoyISO = () => { const d = new Date(); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()) }

// ---- fechas y días trabajados de un cobro de tarea ----
const r2 = (n) => Math.round(n * 100) / 100
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
export const TIPOS_TAREA = { puntual: 'Puntual', mensual: 'Mensual', quincenal: 'Quincenal', dias: 'Días concretos' }
export const esRecurrente = (t) => t.tipo !== 'puntual'
// Días del mes en los que se paga una tarea recurrente
export const diasPagoDe = (t) => {
  if (t.tipo === 'mensual') return t.dia_pago ? [Number(t.dia_pago)] : []
  return [...new Set((t.dias_pago || []).map(Number).filter((d) => d >= 1 && d <= 28))].sort((a, b) => a - b)
}
// Fechas de pago entre dos fechas; cada una cubre desde el pago anterior hasta el día antes de este
export function periodosTarea(t, desde, hasta) {
  const dias = diasPagoDe(t)
  if (!dias.length) return []
  const [y0, m0] = desde.split('-').map(Number), [y1, m1] = hasta.split('-').map(Number)
  const fechas = []
  let y = m0 === 1 ? y0 - 1 : y0, m = m0 === 1 ? 12 : m0 - 1
  const fin = y1 * 12 + m1 + 1
  while (y * 12 + m <= fin) {
    for (const d of dias) fechas.push(isoDe(y, m, Math.min(d, diasDelMes(y, m))))
    m++; if (m > 12) { m = 1; y++ }
  }
  const orden = [...new Set(fechas)].sort()
  const out = []
  for (let i = 1; i < orden.length; i++) if (orden[i] >= desde && orden[i] <= hasta) out.push({ pago: orden[i], desde: orden[i - 1], hasta: sumarDias(orden[i], -1) })
  return out
}
// Importe de un cobro: base menos (base ÷ días del periodo) por cada día no trabajado (marcados + anteriores al inicio de la tarea)
export function calcularItem({ base, desde, hasta, libres = [], inicio = null }) {
  const dias = difDias(hasta, desde) + 1
  const L = new Set(libres)
  let sin = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (L.has(f) || (inicio && f < inicio)) sin++
  const b = r2(num(base))
  const descuento = Math.min(b, r2((dias ? b / dias : 0) * sin))
  return { base: b, dias, trabajados: dias - sin, descuento, aPagar: r2(b - descuento) }
}
// Tramos realmente trabajados
export function rangosTarea(desde, hasta, libres = [], inicio = null) {
  const L = new Set(libres), out = []; let ini = null, ult = null
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const no = L.has(f) || (inicio && f < inicio)
    if (!no) { if (!ini) ini = f; ult = f } else if (ini) { out.push([ini, ult]); ini = null }
  }
  if (ini) out.push([ini, ult])
  return out
}

// Filas de cobro que faltan por crear: las puntuales una vez; las recurrentes (mensual, quincenal, días concretos), una por cada día de pago hasta el mes que viene.
export function filasFaltantes(tasks, items, hoy = hoyISO()) {
  const yaFecha = new Set(items.flatMap((i) => [i.task_id + '|' + i.fecha_pago, ...(i.fecha_original ? [i.task_id + '|' + i.fecha_original] : [])]))
  const yaMes = new Set(items.flatMap((i) => [i.task_id + '|' + i.fecha_pago.slice(0, 7), ...(i.fecha_original ? [i.task_id + '|' + i.fecha_original.slice(0, 7)] : [])])) // las mensuales: solo una por mes
  const out = []
  const [hy, hm] = hoy.split('-').map(Number)
  for (const t of tasks) {
    if (!t.activa) continue
    const omit = new Set(t.omitidos || []) // meses (mensual) o fechas (resto) quitados a mano
    const base = { task_id: t.id, titulo: t.titulo, responsable_id: t.responsable_id, monto: t.monto }
    if (t.tipo === 'puntual') {
      if (t.fecha_pago && !yaFecha.has(t.id + '|' + t.fecha_pago)) out.push({ ...base, fecha_pago: t.fecha_pago })
    } else {
      const desde = t.desde || (t.created_at || hoy).slice(0, 10)
      const limite = isoDe(hy + (hm === 12 ? 1 : 0), hm === 12 ? 1 : hm + 1, 28) // hasta el mes siguiente
      for (const pr of periodosTarea(t, desde, limite)) {
        const f = pr.pago
        if (omit.has(f) || omit.has(f.slice(0, 7)) || yaFecha.has(t.id + '|' + f) || (t.tipo === 'mensual' && yaMes.has(t.id + '|' + f.slice(0, 7)))) continue
        const libres = (t.faltas || []).filter((d) => d >= pr.desde && d <= pr.hasta) // faltas registradas en la tarea
        const c = calcularItem({ base: t.monto, desde: pr.desde, hasta: pr.hasta, libres, inicio: desde })
        out.push({ ...base, fecha_pago: f, periodo_desde: pr.desde, periodo_hasta: pr.hasta, monto_base: t.monto, dias_libres: libres, monto: c.aPagar })
      }
    }
  }
  return out
}

// Carga tareas y cobros; crea los cobros que falten (mensuales) y los devuelve ya completos.
export async function cargarTareas(area = 'chatting') {
  const t = await supabase.from('pay_tasks').select('*').order('created_at')
  if (t.error) return { tasks: [], items: [], error: t.error.message }
  let i = await supabase.from('pay_task_items').select('*').order('fecha_pago').limit(5000)
  if (i.error) return { tasks: (t.data || []).filter((x) => (x.area || 'chatting') === area), items: [], error: i.error.message }
  const tasks = (t.data || []).filter((x) => (x.area || 'chatting') === area)
  const ids = new Set(tasks.map((x) => x.id))
  let items = (i.data || []).filter((x) => ids.has(x.task_id))
  const nuevas = filasFaltantes(tasks, items)
  if (nuevas.length) {
    await supabase.from('pay_task_items').upsert(nuevas, { onConflict: 'task_id,fecha_pago', ignoreDuplicates: true })
    const r = await supabase.from('pay_task_items').select('*').order('fecha_pago').limit(5000)
    items = (r.data || []).filter((x) => ids.has(x.task_id))
  }
  return { tasks, items, error: null }
}
