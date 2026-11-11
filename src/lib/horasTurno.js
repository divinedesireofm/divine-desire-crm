// Horas de los turnos: se definen en hora de Venezuela y se muestran también en hora de España (cambia sola con el horario de verano/invierno)
const TZ_VE = 'America/Caracas'
const TZ_ES = 'Europe/Madrid'
// OJO: los ids guardados en la base de datos son antiguos y NO cambian (noche = 4–12 h VE, mañana = 12–20, tarde = 20–4).
// Los nombres que se muestran ahora son: Mañana (4–12 VE), Tarde (12–20 VE) y Noche (20–4 VE).
const INICIOS = { noche: 4, 'mañana': 12, tarde: 20 }

function horaEnZona(ts, tz) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false }).format(ts)
}
// Diferencia en horas España − Venezuela a una fecha concreta (5 en invierno, 6 en verano)
export function diferenciaES_VE(fecha = new Date()) {
  const h = (tz) => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, day: 'numeric' }).formatToParts(fecha).find((p) => p.type === 'hour').value, 10) % 24
  const d = (tz) => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(fecha), 10)
  let dif = (h(TZ_ES) + 24 * (d(TZ_ES) - d(TZ_VE))) - h(TZ_VE)
  if (dif > 12) dif -= 24
  if (dif < -12) dif += 24
  return dif
}
const f = (h) => `${((h % 24) + 24) % 24}:00`
// "4:00 – 12:00 VE · 9:00 – 17:00 ES"
export function horarioTurno(id, fecha = new Date()) {
  const ini = INICIOS[id === 'madrugada' ? 'noche' : id]
  if (ini == null) return ''
  const dif = diferenciaES_VE(fecha)
  return `${f(ini)} – ${f(ini + 8)} VE · ${f(ini + dif)} – ${f(ini + 8 + dif)} ES`
}
// Marca de tiempo en las dos horas: "07/11 18:20 ES · 12:20 VE"
export function fechaHoraDoble(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const dia = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ES, day: '2-digit', month: '2-digit' }).format(d)
  return `${dia} ${horaEnZona(d, TZ_ES)} ES · ${horaEnZona(d, TZ_VE)} VE`
}
