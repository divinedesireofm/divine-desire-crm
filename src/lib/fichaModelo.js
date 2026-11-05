// Plantilla de la ficha general de cada modelo (información que no importa que sepan los usuarios).
// k = clave guardada, n = pregunta, largo = caja grande, tipo 'sino' = Sí / No, ayuda = pista, detalle = campo de texto extra ligado a un Sí/No.
export const FICHA = [
  {
    id: 'personal', titulo: 'Datos personales',
    intro: 'Poner información que no te importe que sepan los usuarios.',
    campos: [
      { k: 'nombre_completo', n: 'Nombre completo' },
      { k: 'telefono_modelo', n: 'Modelo de teléfono' },
      { k: 'idiomas', n: 'Idiomas' },
      { k: 'edad', n: 'Edad' },
      { k: 'cumpleanos', n: 'Fecha de cumpleaños' },
      { k: 'altura', n: 'Altura' },
      { k: 'talla_zapato', n: 'Talla de zapato' },
      { k: 'nacionalidad', n: 'Nacionalidad que se le indicará a los usuarios' },
      { k: 'instagrams', n: 'Instagram(s)' },
      { k: 'rutinas', n: 'Rutinas diarias', largo: true },
      { k: 'hobbies', n: 'Hobbies', largo: true },
      { k: 'comida', n: 'Comida favorita' },
      { k: 'color', n: 'Color favorito' },
      { k: 'mascotas', n: 'Mascotas (con nombre)' },
      { k: 'trabajo', n: 'De qué trabaja', ayuda: 'Si haces lives/webcam, poner toda la info: horarios, días y link para verte', largo: true },
      { k: 'estudios', n: 'Qué estudias o estudiaste' },
      { k: 'gustos', n: 'Películas y series favoritas (al menos su género) y música favorita (género)', largo: true },
      { k: 'viajes', n: 'Lugares a donde has viajado (países)' },
      { k: 'conocida', n: '¿Algún suscriptor te conoce en persona o de vista?', largo: true },
      { k: 'novio', n: '¿Tienes novio?' },
    ],
  },
  {
    id: 'contenido', titulo: '¿Qué contenido hace?',
    campos: [
      { k: 'anal', n: 'Anal', tipo: 'sino' },
      { k: 'personalizados', n: 'Personalizados', tipo: 'sino' },
      { k: 'videollamadas', n: 'Videollamadas', tipo: 'sino' },
      { k: 'squirt', n: 'Squirt', tipo: 'sino' },
      { k: 'sexo_mujeres', n: 'Sexo con mujeres', tipo: 'sino' },
      { k: 'sexo_pareja', n: 'Sexo en pareja', tipo: 'sino' },
      { k: 'colaboraciones', n: '¿Hace colaboraciones?', tipo: 'sino', detalle: 'colaboraciones_detalle', ayuda: 'Si es SÍ, indicar si virtual, presencial y a qué zona/ciudad podría moverse' },
    ],
  },
  {
    id: 'clientes', titulo: 'Información para que los clientes no sospechen',
    intro: 'Adjuntar la mayor cantidad de información detallada posible para evitar que los clientes que ya tiene sospechen de que ha cambiado a agencia.',
    campos: [
      { k: 'info_clientes', n: 'Información sobre algún cliente', largo: true },
      { k: 'usuarios_bloquear', n: 'Usuarios a los que no hablar o bloquearlos', largo: true },
      { k: 'expresiones', n: 'Qué expresiones usa para dirigirse a sus clientes (amor, bebé…)', largo: true },
      { k: 'notas', n: 'Notas que quiera dejarnos para tener en cuenta', largo: true },
    ],
  },
]

const vacio = (v) => v === undefined || v === null || String(v).trim() === ''
export const SINO = { si: 'Sí', no: 'No' }

// Cuántos campos de la plantilla están rellenados (el detalle de colaboraciones no cuenta aparte)
export function progresoFicha(datos) {
  let total = 0; let hechos = 0
  FICHA.forEach((s) => s.campos.forEach((c) => { total += 1; if (!vacio(datos?.[c.k])) hechos += 1 }))
  return { total, hechos }
}
export function valorTexto(c, datos) {
  const v = datos?.[c.k]
  if (c.tipo === 'sino') {
    const t = v ? SINO[v] : ''
    const d = c.detalle && !vacio(datos?.[c.detalle]) ? String(datos[c.detalle]).trim() : ''
    return [t, d].filter(Boolean).join(' — ')
  }
  return vacio(v) ? '' : String(v).trim()
}
// Texto listo para copiar (con las mismas preguntas de la plantilla)
export function textoFicha(nombre, datos) {
  const l = [`FICHA GENERAL — ${String(nombre || '').toUpperCase()}`]
  FICHA.forEach((s) => {
    l.push('', s.titulo.toUpperCase())
    s.campos.forEach((c) => l.push(`${c.n}: ${valorTexto(c, datos) || '—'}`))
  })
  return l.join('\n') + '\n'
}
