import { supabase } from './supabase'

const pad = (n) => String(n).padStart(2, '0')
export const diasDelMes = (y, m) => new Date(y, m, 0).getDate() // m = 1..12
export const isoDe = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const hoyISO = () => { const d = new Date(); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()) }

// Filas de cobro que faltan por crear: las puntuales una vez; las mensuales, una por mes desde «desde» hasta el mes que viene.
export function filasFaltantes(tasks, items, hoy = hoyISO()) {
  const ya = new Set(items.flatMap((i) => [i.task_id + '|' + i.fecha_pago, i.task_id + '|' + i.fecha_pago.slice(0, 7), ...(i.fecha_original ? [i.task_id + '|' + i.fecha_original, i.task_id + '|' + i.fecha_original.slice(0, 7)] : [])])) // y «ya hay uno ese mes» para las mensuales
  const out = []
  const [hy, hm] = hoy.split('-').map(Number)
  for (const t of tasks) {
    if (!t.activa) continue
    const base = { task_id: t.id, titulo: t.titulo, responsable_id: t.responsable_id, monto: t.monto }
    if (t.tipo === 'puntual') {
      if (t.fecha_pago && !ya.has(t.id + '|' + t.fecha_pago)) out.push({ ...base, fecha_pago: t.fecha_pago })
    } else if (t.tipo === 'mensual' && t.dia_pago) {
      const desde = t.desde || (t.created_at || hoy).slice(0, 10)
      let [y, m] = desde.split('-').map(Number)
      for (let n = 0; n < 48; n++) {
        const limite = hy * 12 + hm + 1 // hasta el mes siguiente
        if (y * 12 + m > limite) break
        const f = isoDe(y, m, Math.min(Number(t.dia_pago), diasDelMes(y, m)))
        if (f >= desde && !ya.has(t.id + '|' + f) && !ya.has(t.id + '|' + f.slice(0, 7))) out.push({ ...base, fecha_pago: f })
        m++; if (m > 12) { m = 1; y++ }
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
