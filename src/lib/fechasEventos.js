// Cálculo compartido de «Fechas importantes»: lo usan la página y los avisos (campana).
import { PAISES, COLOR_MANUAL, COLOR_PERSONA, festividades } from './festividades'

export const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const sumarDias = (s, n) => { const d = aDate(s); d.setDate(d.getDate() + n); return iso(d) }
export const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)

export const TIPOS = { otra: 'Otra fecha', cumpleanos: 'Cumpleaños', aniversario: 'Aniversario' }

// Festividades que se guardaban con el botón del lote 13: ahora se generan por país
export const LEGACY_TITULOS = new Set(['Acción de Gracias', 'Asunción de la Virgen', 'Año Nuevo', 'Batalla de Carabobo', 'Black Friday', 'Cinco de Mayo', 'Cyber Monday', 'Declaración de la Independencia de Venezuela', 'Domingo de Pascua', 'Día Internacional de la Mujer', 'Día de Reyes', 'Día de la Independencia de EE. UU.', 'Día de la Independencia de Venezuela', 'Día de la Madre (EE. UU. y Venezuela)', 'Día de la Madre (España)', 'Día del Padre', 'Día del Padre (EE. UU.)', 'Día del Soltero', 'Día del Trabajo', 'Fiesta Nacional de España / Día de la Resistencia Indígena', 'Halloween', 'Inmaculada Concepción', 'Labor Day', 'Memorial Day', 'Natalicio de Simón Bolívar', 'Navidad', 'Nochebuena', 'Nochevieja', 'San Patricio', 'San Valentín', 'Todos los Santos', 'Viernes Santo'])
export const LEGACY_NOTAS = new Set(['EE. UU.', 'EE. UU. y México', 'EE. UU. · tercer domingo de junio', 'España', 'España y Venezuela · festivo, revisar turnos', 'España · festivo', 'España · primer domingo de mayo', 'Global', 'Global · fecha clave para promociones y masivos temáticos', 'Global · fecha fuerte para contenido temático', 'Global · fecha fuerte para promos', 'Global · revisar turnos', 'Segundo domingo de mayo · fecha fuerte', 'Venezuela · festivo, revisar turnos', 'Venezuela · festivo, revisar turnos del equipo'])
export const esLegacy = (r) => LEGACY_TITULOS.has(r.titulo) && LEGACY_NOTAS.has(r.notas || '')

// Una fecha guardada que se repite → su aparición dentro de un rango (puede haber varias si abarca años)
export function ocurrenciasEnRango(e, desde, hasta) {
  const [y0, m0, d0] = e.fecha.split('-').map(Number)
  const repite = e.recurrente || e.tipo === 'cumpleanos' || e.tipo === 'aniversario'
  if (!repite) return e.fecha >= desde && e.fecha <= hasta ? [e.fecha] : []
  const out = []
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
    if (y < y0) continue
    let d = new Date(y, m0 - 1, d0)
    if (d.getMonth() !== m0 - 1) d = new Date(y, m0 - 1, 28) // 29 de febrero en año no bisiesto
    const s = iso(d)
    if (s >= desde && s <= hasta) out.push(s)
  }
  return out
}

// Todo lo que cae en un rango.
//  rows: fechas guardadas (con `vigente` ya calculado por la base de datos)
//  paises: ids elegidos ('es', 've'… o 'c:<uuid>' para un país creado por el equipo)
//  custom: países creados por el equipo [{ id, nombre, color }]
export function calcularEventos({ rows, paises, custom, desde, hasta }) {
  const out = []
  const idsIntegrados = paises.filter((p) => !p.startsWith('c:'))
  festividades(idsIntegrados, desde, hasta).forEach((f) => {
    const p = PAISES.find((x) => x.id === f.pais)
    if (!p) return
    out.push({ key: `f-${f.pais}-${f.fecha}-${f.titulo}`, fecha: f.fecha, titulo: f.titulo, color: p.color, etiqueta: p.n, notas: f.tipo === 'celebracion' ? 'Celebración' : 'Festivo', borrable: null, aviso: `${f.titulo} (${p.n})` })
  })
  rows.forEach((r) => {
    if (r.vigente === false || esLegacy(r)) return
    const esPersona = r.tipo === 'cumpleanos' || r.tipo === 'aniversario'
    let color = esPersona ? COLOR_PERSONA : COLOR_MANUAL
    let etiqueta = esPersona ? TIPOS[r.tipo] : 'Manual'
    if (r.pais_id) {
      if (!paises.includes('c:' + r.pais_id)) return
      const c = custom.find((x) => x.id === r.pais_id)
      if (!c) return
      color = c.color; etiqueta = c.nombre
    }
    ocurrenciasEnRango(r, desde, hasta).forEach((f) => {
      const n = Number(f.slice(0, 4)) - Number(r.fecha.slice(0, 4))
      let extra = ''
      if (r.tipo === 'cumpleanos' && n > 0 && n < 100) extra = `cumple ${n}`
      if (r.tipo === 'aniversario' && n > 0) extra = `${n}.º aniversario`
      out.push({
        key: `d-${r.id}-${f}`, fecha: f, titulo: r.titulo, color, etiqueta,
        notas: [extra, r.notas].filter(Boolean).join(' · '), borrable: r,
        aviso: extra ? `${r.titulo} (${extra})` : r.titulo,
      })
    })
  })
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Avisos de la campana: 1 semana antes, 2 días antes, 1 día antes y el mismo día
export const DIAS_AVISO = [7, 2, 1, 0]
export function avisosDeFechas({ rows, paises, custom, hoy }) {
  const evs = calcularEventos({ rows, paises, custom, desde: hoy, hasta: sumarDias(hoy, 7) })
  const out = []
  evs.forEach((e) => {
    const dias = difDias(e.fecha, hoy)
    if (!DIAS_AVISO.includes(dias)) return
    const cuando = dias === 0 ? '¡Hoy!' : dias === 1 ? 'Mañana' : dias === 2 ? 'En 2 días' : 'En 1 semana'
    out.push({
      key: `fecha:${e.key}:${dias}`, tipo: 'fecha',
      prioridad: dias <= 2 ? 'alta' : 'media',
      texto: `${cuando}: ${e.aviso}`, ruta: '/fechas', fecha: null,
    })
  })
  return out
}
