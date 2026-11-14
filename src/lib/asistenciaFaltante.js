import { supabase } from './supabase'
import { getExtrabajadorIds } from './roles'

// Turnos según el horario (ids antiguos de la base de datos): noche = 4–12 h VE, mañana = 12–20, tarde = 20–4. Venezuela = UTC−4 todo el año.
const INICIOS = { noche: 4, 'mañana': 12, tarde: 20 }
export const TOLERANCIA_ENTRADA_MIN = 30 // minutos tras el inicio del turno antes de avisar de que no ha entrado
export const GRACIA_SALIDA_MIN = 60 // minutos tras el fin del turno antes de avisar de que no ha marcado la salida
export const DIAS_REVISION_ASISTENCIA = 7

export function ventanaTurno(fecha, turno) {
  const ini = INICIOS[turno === 'madrugada' ? 'noche' : turno]
  if (ini == null || !fecha) return null
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  const start = Date.UTC(y, m - 1, d, ini + 4)
  return { start, end: start + 8 * 3600000 }
}

// Cruza el horario con los fichajes: quién tenía turno y no marcó entrada o no marcó salida.
export function calcularFaltasAsistencia({ schedules = [], eventos = [], ahora = Date.now() }) {
  const porChatter = {}
  eventos.forEach((e) => { (porChatter[e.chatter_id] = porChatter[e.chatter_id] || []).push({ tipo: e.tipo, t: new Date(e.created_at).getTime() }) })
  Object.values(porChatter).forEach((l) => l.sort((a, b) => a.t - b.t))
  const faltas = []
  schedules.forEach((s) => {
    const w = ventanaTurno(s.fecha, s.turno)
    if (!w || ahora < w.start + TOLERANCIA_ENTRADA_MIN * 60000) return
    const evs = porChatter[s.chatter_id] || []
    const base = { scheduleId: s.id, chatterId: s.chatter_id, nombre: s.profiles?.full_name || '—', fecha: s.fecha, turno: s.turno, inicio: w.start, fin: w.end }
    const entrada = evs.find((e) => e.tipo === 'entrada' && e.t >= w.start - 3600000 && e.t <= w.end)
    if (!entrada) { faltas.push({ ...base, tipo: 'sin_entrada', clave: s.id + '|sin_entrada', terminado: ahora > w.end }); return }
    if (ahora <= w.end + GRACIA_SALIDA_MIN * 60000) return
    const salida = evs.find((e) => e.tipo === 'salida' && e.t > entrada.t && e.t <= entrada.t + 16 * 3600000)
    const otraEntrada = evs.find((e) => e.tipo === 'entrada' && e.t > entrada.t && (!salida || e.t < salida.t))
    if (!salida || otraEntrada) faltas.push({ ...base, tipo: 'sin_salida', clave: s.id + '|sin_salida', entrada: entrada.t })
  })
  return faltas.sort((a, b) => b.inicio - a.inicio)
}

const isoDia = (ms) => new Date(ms).toISOString().slice(0, 10)

// Carga horario + fichajes y devuelve las faltas vigentes y las que el admin quitó (aún sin resolver)
export async function cargarFaltasAsistencia(ahora = Date.now()) {
  const desde = isoDia(ahora - DIAS_REVISION_ASISTENCIA * 86400000), hasta = isoDia(ahora + 86400000)
  try { await supabase.rpc('materializar_repeticiones', { p_desde: desde, p_hasta: hasta }) } catch { /* sin repeticiones */ }
  const [sc, ev, ds, ex] = await Promise.all([
    supabase.from('schedules').select('id, fecha, turno, chatter_id, profiles(full_name)').gte('fecha', desde).lte('fecha', hasta).limit(2000),
    supabase.from('attendance_events').select('chatter_id, tipo, created_at').gte('created_at', new Date(ahora - (DIAS_REVISION_ASISTENCIA + 2) * 86400000).toISOString()).order('created_at', { ascending: true }).limit(5000),
    supabase.from('avisos_turno_descartados').select('clave').limit(3000),
    getExtrabajadorIds(),
  ])
  if (sc.error || ev.error) return { faltas: [], quitadas: [] }
  const quitadasSet = new Set((ds.data || []).map((d) => d.clave))
  const todas = calcularFaltasAsistencia({
    schedules: (sc.data || []).filter((s) => !ex.has(s.chatter_id) && s.fecha >= desde),
    eventos: ev.data || [], ahora,
  })
  return { faltas: todas.filter((f) => !quitadasSet.has(f.clave)), quitadas: todas.filter((f) => quitadasSet.has(f.clave)) }
}

export function textoFalta(f, fmt) {
  if (f.tipo === 'sin_salida') return `Marcó la entrada (${fmt(f.entrada)}) pero no ha marcado la salida`
  return f.terminado ? 'No ha marcado entrada ni salida en todo el turno' : 'Todavía no ha marcado la entrada'
}
