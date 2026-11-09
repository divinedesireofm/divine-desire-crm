import { supabase } from './supabase'
import { reducirAdjunto } from './imagenesInforme'

export const BUCKET_MASIVOS = 'masivos-img'
export const AVISO_MINUTOS = 5 // el aviso bloqueante sale 5 minutos antes de la hora de envío

// Orden de arriba abajo dentro de cada día. Las horas son de Venezuela (así se definieron los turnos).
export const TURNOS = [
  { id: 'noche', label: 'Noche', ini: 4, color: '#6b8cff' },
  { id: 'mañana', label: 'Mañana', ini: 12, color: '#f5a524' },
  { id: 'tarde', label: 'Tarde', ini: 20, color: '#c264ff' },
]
export const turnoDe = (id) => TURNOS.find((t) => t.id === id) || null

const PALETA = ['#e5484d', '#30a46c', '#0091ff', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#978365', '#3e63dd', '#ab6400']
// Color estable por trabajador (siempre el mismo para la misma persona)
export function colorChatter(id) {
  let h = 0
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

const TZ_ES = 'Europe/Madrid'
// Instante en el que en Madrid son las hh:mm del día aaaa-mm-dd
function instanteMadrid(fecha, hhmm) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const utcGuess = Date.UTC(y, m - 1, d, h, mi)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ_ES, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcGuess))
  const g = (t) => parseInt(parts.find((p) => p.type === t).value, 10) % (t === 'hour' ? 24 : 100000)
  const como = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
  return new Date(utcGuess - (como - utcGuess))
}
// Inicio del turno de ese día (Venezuela = UTC−4 todo el año)
export function inicioTurno(fecha, turnoId) {
  const t = turnoDe(turnoId); if (!t) return null
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, t.ini + 4))
}
const hhmmES = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ES, hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
const hhmmVE = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
// Hora de España por defecto de un turno ("09:00")
export function horaPorDefecto(fecha, turnoId) {
  const i = inicioTurno(fecha, turnoId); return i ? hhmmES(i) : '12:00'
}
// De (día, turno, hora de España) al instante real. Los turnos que pasan de medianoche en España cuentan en el día en que empiezan.
export function calcularEnviarEn(fecha, turnoId, hhmm) {
  const ini = inicioTurno(fecha, turnoId)
  const base = new Date(fecha + 'T00:00:00Z')
  for (const k of [0, 1, -1]) {
    const dia = new Date(base.getTime() + k * 86400000).toISOString().slice(0, 10)
    const t = instanteMadrid(dia, hhmm)
    if (ini && t >= ini.getTime() - 3600000 && t <= ini.getTime() + 9 * 3600000) return t
  }
  return instanteMadrid(fecha, hhmm)
}
// "18:30 ES · 12:30 VE"
export function horaDoble(ts) {
  if (!ts) return ''
  const d = new Date(ts); return `${hhmmES(d)} ES · ${hhmmVE(d)} VE`
}

export async function subirImagenMasivo({ userId, file }) {
  const blob = await reducirAdjunto(file)
  const limpio = String(file.name || 'imagen').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'imagen'
  const path = `${userId}/${Date.now()}-${limpio}.jpg`
  const { error } = await supabase.storage.from(BUCKET_MASIVOS).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
}
export async function urlImagenMasivo(path, segundos = 3600) {
  const { data } = await supabase.storage.from(BUCKET_MASIVOS).createSignedUrl(path, segundos)
  return data?.signedUrl || ''
}
export async function borrarImagenMasivo(path) {
  await supabase.storage.from(BUCKET_MASIVOS).remove([path])
}
