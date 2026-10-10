// Festividades por país, calculadas para cualquier año (fijas + móviles). No se guardan en la base de datos:
// se generan al elegir los países en «Fechas importantes».

export const PAISES = [
  { id: 'global', n: 'Global (comercial)', color: '#a974f0' },
  { id: 'es', n: 'España', color: '#e5484d' },
  { id: 've', n: 'Venezuela', color: '#e9b824' },
  { id: 'us', n: 'EE. UU.', color: '#4c8dff' },
  { id: 'mx', n: 'México', color: '#2fb67c' },
  { id: 'co', n: 'Colombia', color: '#f08a3c' },
]
export const COLOR_MANUAL = '#e2e8f0'      // fechas que añade el equipo a mano
export const COLOR_PERSONA = '#ff6fae'     // cumpleaños y aniversarios

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const sumar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fijo = (y, mm, dd) => new Date(y, mm - 1, dd)
// n-ésimo día de la semana (0=dom…6=sáb) de un mes (1-12); n=-1 → el último
function nEsimo(y, mes, dow, n) {
  if (n > 0) { const d = new Date(y, mes - 1, 1); d.setDate(1 + ((dow - d.getDay() + 7) % 7) + (n - 1) * 7); return d }
  const d = new Date(y, mes, 0); d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7)); return d
}
// Si la fecha no cae en lunes, pasa al lunes siguiente (festivos «Ley Emiliani» de Colombia)
function allunes(d) { const x = new Date(d); x.setDate(x.getDate() + ((8 - x.getDay()) % 7)); return x }
// Domingo de Pascua (Meeus/Jones/Butcher)
export function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1)
}

// Devuelve [{ fecha:'AAAA-MM-DD', titulo, pais, tipo:'festivo'|'celebracion' }] de un país en un año
function deAnio(pais, y) {
  const P = pascua(y)
  const L = []
  const f = (d, titulo, tipo = 'festivo') => L.push({ fecha: iso(d), titulo, pais, tipo })
  const madre2 = () => f(nEsimo(y, 5, 0, 2), 'Día de la Madre', 'celebracion')
  const padre3 = () => f(nEsimo(y, 6, 0, 3), 'Día del Padre', 'celebracion')
  const accion = nEsimo(y, 11, 4, 4)

  if (pais === 'global') {
    f(fijo(y, 2, 14), 'San Valentín', 'celebracion')
    f(fijo(y, 3, 8), 'Día Internacional de la Mujer', 'celebracion')
    f(P, 'Domingo de Pascua', 'celebracion')
    f(fijo(y, 10, 31), 'Halloween', 'celebracion')
    f(fijo(y, 11, 11), 'Día del Soltero', 'celebracion')
    f(sumar(accion, 1), 'Black Friday', 'celebracion')
    f(sumar(accion, 4), 'Cyber Monday', 'celebracion')
    f(fijo(y, 12, 24), 'Nochebuena', 'celebracion')
    f(fijo(y, 12, 25), 'Navidad', 'celebracion')
    f(fijo(y, 12, 31), 'Nochevieja', 'celebracion')
  }
  if (pais === 'es') {
    f(fijo(y, 1, 1), 'Año Nuevo'); f(fijo(y, 1, 6), 'Día de Reyes'); f(sumar(P, -2), 'Viernes Santo')
    f(fijo(y, 5, 1), 'Día del Trabajo'); f(fijo(y, 8, 15), 'Asunción de la Virgen'); f(fijo(y, 10, 12), 'Fiesta Nacional de España')
    f(fijo(y, 11, 1), 'Todos los Santos'); f(fijo(y, 12, 6), 'Día de la Constitución'); f(fijo(y, 12, 8), 'Inmaculada Concepción'); f(fijo(y, 12, 25), 'Navidad')
    f(fijo(y, 3, 19), 'Día del Padre', 'celebracion'); f(nEsimo(y, 5, 0, 1), 'Día de la Madre', 'celebracion')
  }
  if (pais === 've') {
    f(fijo(y, 1, 1), 'Año Nuevo'); f(sumar(P, -48), 'Lunes de Carnaval'); f(sumar(P, -47), 'Martes de Carnaval')
    f(sumar(P, -3), 'Jueves Santo'); f(sumar(P, -2), 'Viernes Santo'); f(fijo(y, 4, 19), 'Declaración de la Independencia')
    f(fijo(y, 5, 1), 'Día del Trabajo'); f(fijo(y, 6, 24), 'Batalla de Carabobo'); f(fijo(y, 7, 5), 'Día de la Independencia')
    f(fijo(y, 7, 24), 'Natalicio de Simón Bolívar'); f(fijo(y, 10, 12), 'Día de la Resistencia Indígena')
    f(fijo(y, 12, 24), 'Nochebuena'); f(fijo(y, 12, 25), 'Navidad'); f(fijo(y, 12, 31), 'Fin de Año')
    madre2(); padre3()
  }
  if (pais === 'us') {
    f(fijo(y, 1, 1), 'Año Nuevo'); f(nEsimo(y, 1, 1, 3), 'Martin Luther King Jr. Day'); f(nEsimo(y, 2, 1, 3), "Presidents' Day")
    f(nEsimo(y, 5, 1, -1), 'Memorial Day'); f(fijo(y, 6, 19), 'Juneteenth'); f(fijo(y, 7, 4), 'Día de la Independencia')
    f(nEsimo(y, 9, 1, 1), 'Labor Day'); f(nEsimo(y, 10, 1, 2), 'Columbus Day'); f(fijo(y, 11, 11), 'Veterans Day')
    f(accion, 'Acción de Gracias'); f(fijo(y, 12, 25), 'Navidad')
    f(fijo(y, 3, 17), 'San Patricio', 'celebracion'); madre2(); padre3()
  }
  if (pais === 'mx') {
    f(fijo(y, 1, 1), 'Año Nuevo'); f(nEsimo(y, 2, 1, 1), 'Día de la Constitución'); f(nEsimo(y, 3, 1, 3), 'Natalicio de Benito Juárez')
    f(sumar(P, -3), 'Jueves Santo'); f(sumar(P, -2), 'Viernes Santo'); f(fijo(y, 5, 1), 'Día del Trabajo')
    f(fijo(y, 9, 16), 'Día de la Independencia'); f(nEsimo(y, 11, 1, 3), 'Día de la Revolución'); f(fijo(y, 12, 25), 'Navidad')
    f(fijo(y, 2, 14), 'Día del Amor y la Amistad', 'celebracion'); f(fijo(y, 5, 5), 'Cinco de Mayo', 'celebracion')
    f(fijo(y, 5, 10), 'Día de las Madres', 'celebracion'); padre3()
    f(fijo(y, 11, 2), 'Día de Muertos', 'celebracion'); f(fijo(y, 12, 12), 'Virgen de Guadalupe', 'celebracion')
  }
  if (pais === 'co') {
    f(fijo(y, 1, 1), 'Año Nuevo'); f(allunes(fijo(y, 1, 6)), 'Día de los Reyes Magos'); f(allunes(fijo(y, 3, 19)), 'Día de San José')
    f(sumar(P, -3), 'Jueves Santo'); f(sumar(P, -2), 'Viernes Santo'); f(fijo(y, 5, 1), 'Día del Trabajo')
    f(sumar(P, 43), 'Ascensión del Señor'); f(sumar(P, 64), 'Corpus Christi'); f(sumar(P, 71), 'Sagrado Corazón')
    f(allunes(fijo(y, 6, 29)), 'San Pedro y San Pablo'); f(fijo(y, 7, 20), 'Día de la Independencia'); f(fijo(y, 8, 7), 'Batalla de Boyacá')
    f(allunes(fijo(y, 8, 15)), 'Asunción de la Virgen'); f(allunes(fijo(y, 10, 12)), 'Día de la Raza'); f(allunes(fijo(y, 11, 1)), 'Todos los Santos')
    f(allunes(fijo(y, 11, 11)), 'Independencia de Cartagena'); f(fijo(y, 12, 8), 'Inmaculada Concepción'); f(fijo(y, 12, 25), 'Navidad')
    madre2(); padre3()
  }
  return L
}

// Festividades de los países elegidos entre dos fechas ISO (inclusive)
export function festividades(paises, desdeISO, hastaISO) {
  const y0 = Number(desdeISO.slice(0, 4)), y1 = Number(hastaISO.slice(0, 4))
  const out = []
  for (const p of paises) for (let y = y0; y <= y1; y++) deAnio(p, y).forEach((x) => { if (x.fecha >= desdeISO && x.fecha <= hastaISO) out.push(x) })
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}
