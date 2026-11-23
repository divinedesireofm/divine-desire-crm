import { supabase } from './supabase'

export const TURNOS_FAN = [{ id: 'mañana', n: 'Mañana' }, { id: 'tarde', n: 'Tarde' }, { id: 'noche', n: 'Noche' }]
export const normTurno = (t) => (t === 'madrugada' ? 'noche' : t || '')   // los reportes antiguos de madrugada cuentan como noche

// Todas las compras anotadas en los reportes de turno (de todo el tiempo si no se indica rango)
export async function traerComprasFans(desde, hasta) {
  const filas = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('shift_report_details')
      .select('compras, model_id, models(stage_name), shift_reports!inner(fecha, turno, chatter_id, profiles(full_name))')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (desde) q = q.gte('shift_reports.fecha', desde)
    if (hasta) q = q.lte('shift_reports.fecha', hasta)
    const { data, error } = await q
    if (error || !data) return { filas, error: error?.message || null }
    filas.push(...data)
    if (data.length < 1000) break
  }
  return { filas, error: null }
}

// Aplana a una lista de compras sueltas: { user, fan, monto, tipo, fecha, turno, chatterId, chatter, modeloId, modelo }
export function aplanar(filas) {
  const out = []
  let sinMonto = 0
  for (const d of filas) {
    const sr = d.shift_reports || {}
    for (const c of d.compras || []) {
      const user = String(c.user || '').trim()
      const monto = Number(c.monto) || 0
      if (user.length < 2 || !(monto > 0)) { sinMonto++; continue }
      out.push({ user, fan: c.fan || '', monto, tipo: c.tipo === 'tip' ? 'tip' : 'ppv', fecha: sr.fecha || '', turno: normTurno(sr.turno), chatterId: sr.chatter_id || '', chatter: sr.profiles?.full_name || 'Sin nombre', modeloId: d.model_id || '', modelo: d.models?.stage_name || '' })
    }
  }
  return { compras: out, sinMonto }
}

// Filtra y agrupa por fan. filtros: { chatter, turno, modelo, desde, hasta, buscar } (cada uno 'todos'/'' = sin filtro)
export function rankingFans(compras, f = {}) {
  const q = (f.buscar || '').trim().toLowerCase()
  const mapa = new Map()
  for (const c of compras) {
    if (f.chatter && f.chatter !== 'todos' && c.chatterId !== f.chatter) continue
    if (f.turno && f.turno !== 'todos' && c.turno !== f.turno) continue
    if (f.modelo && f.modelo !== 'todos' && c.modeloId !== f.modelo) continue
    if (f.desde && c.fecha < f.desde) continue
    if (f.hasta && c.fecha > f.hasta) continue
    const k = c.user.toLowerCase()
    if (q && !k.includes(q) && !c.fan.toLowerCase().includes(q)) continue
    let e = mapa.get(k)
    if (!e) { e = { user: c.user, nombre: c.fan, total: 0, ppv: 0, tips: 0, n: 0, ultima: '', modelos: new Set(), chatters: new Set(), porTurno: { mañana: 0, tarde: 0, noche: 0 } }; mapa.set(k, e) }
    e.total += c.monto
    if (c.tipo === 'tip') e.tips += c.monto; else e.ppv += c.monto
    e.n += 1
    if (c.turno in e.porTurno) e.porTurno[c.turno] += c.monto
    if (c.fecha >= e.ultima) { e.ultima = c.fecha; if (c.fan) e.nombre = c.fan }
    if (c.modelo) e.modelos.add(c.modelo)
    e.chatters.add(c.chatter)
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}
