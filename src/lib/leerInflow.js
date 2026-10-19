import { iaCallJSON } from './ai'

const SYSTEM = `Eres un asistente que lee capturas de pantalla de las estadísticas de empleados/chatters de Infloww (la herramienta de gestión de chats de OnlyFans) de una agencia.
Te pasan una o varias capturas de una tabla con una fila por chatter (empleado) y columnas de métricas.
Reglas:
1. Devuelve UNA entrada por chatter. Si el mismo chatter aparece en varias capturas (por ejemplo cada captura muestra columnas distintas), junta los datos en una sola entrada.
2. "nombre" es el nombre del chatter tal y como aparece, sin inventar nada.
3. Rellena SOLO las métricas que se vean en las capturas. Si una métrica no aparece o no se lee con claridad, devuélvela como null. Nunca inventes ni calcules valores.
4. Importes en dólares como número, sin símbolo ni separador de miles (1.234,50 o 1,234.50 → 1234.5). Recuentos como números enteros.
5. Correspondencia con las columnas de Infloww:
   - ventas_total: ventas totales / Sales / Total sales (bruto, si hay bruto y neto usa el bruto).
   - ventas_ppv: ventas de mensajes de pago (PPV / Message sales) si se muestran por separado.
   - propinas: Tips / propinas si se muestran por separado.
   - mensajes_enviados: mensajes directos enviados / Direct messages sent / Messages sent.
   - ppv_enviados: PPV enviados / Direct PPVs sent / PPVs sent.
   - ppv_desbloqueados: PPV desbloqueados / PPVs unlocked / PPVs purchased.
   - fans_chateados: fans con los que ha chateado / Fans chatted.
   - fans_gastaron: columna «Fans who spent money» (también «Unique fans who spent money» o «Fans spent»): fans únicos que han gastado dinero. Es un recuento de fans, NO dinero.
   - fan_cvr: columna «Fan CVR» (fan conversion rate / tasa de conversión de fans), como número en porcentaje (12.5 si pone 12.5%).
   - media_fan_gasto: columna «Avg earnings per fan who spent money» (también «Avg. earnings per paying fan»): media ganada por cada fan que gasta, en dólares.
   - caracteres: columna «Character count» (caracteres enviados). Si sale abreviado (1.2K, 25K) conviértelo a número completo (1200, 25000).
   - tiempo_respuesta: tiempo de respuesta / Reply time. Si hay dos columnas de tiempo de respuesta, esta es la basada en horas trabajadas/clocked hours; si solo hay una y no dice "scheduled hours", usa esta. Texto exactamente como se ve (por ejemplo "2m 37s" o "00:02:37").
   - tiempo_respuesta_programadas: Response time (based on scheduled hours), solo si existe esa columna; texto tal como se ve.
   - horas_trabajadas: horas trabajadas / Clocked hours, en horas decimales (si sale 7h 30m devuelve 7.5).
6. No devuelvas ratios (golden ratio, unlock ratio), la app los calcula sola. Ignora filas de totales o medias del equipo.
7. Si en las capturas se ve el rango de fechas del informe, devuélvelo en "fecha_inicio" y "fecha_fin" con formato AAAA-MM-DD (si el año no se ve, asume el año en curso). Si no se ve, deja ambos vacíos.
8. Las cabeceras de Infloww llevan iconos (ⓘ) y flechas de ordenación: ignóralos. La tabla es ancha: lee TODAS las columnas visibles en cada captura, también las del extremo derecho, y no dejes ninguna sin mirar.
9. En "columnas_detectadas" lista el nombre exacto, tal como está escrito en inglés en la cabecera, de TODAS las columnas de la tabla que ves (en el orden en que aparecen). Además, para CADA chatter devuelve en su campo "columnas" TODAS las columnas visibles como {columna, valor}: el nombre exacto de la cabecera y el valor tal cual se ve en pantalla (con $, %, K, comas o tiempos como "2m 37s"), sin convertir nada. Eso es lo más importante: no te saltes ninguna columna, aunque no encaje en las métricas de arriba.
10. En "notas" escribe en una frase cualquier cosa que haya que revisar (columnas que no se leen, nombres cortados...). Si no hay nada, deja "".`

const num = { type: ['number', 'null'] }
const SCHEMA = {
  type: 'object',
  properties: {
    fecha_inicio: { type: 'string' },
    fecha_fin: { type: 'string' },
    chatters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          ventas_total: num, ventas_ppv: num, propinas: num,
          mensajes_enviados: num, ppv_enviados: num, ppv_desbloqueados: num, fans_chateados: num,
          tiempo_respuesta: { type: ['string', 'null'] },
          tiempo_respuesta_programadas: { type: ['string', 'null'] },
          columnas: { type: 'array', items: { type: 'object', properties: { columna: { type: 'string' }, valor: { type: 'string' } }, required: ['columna', 'valor'] } },
          horas_trabajadas: num,
        },
        required: ['nombre'],
      },
    },
    columnas_detectadas: { type: 'array', items: { type: 'string' } },
    notas: { type: 'string' },
  },
  required: ['chatters', 'notas', 'columnas_detectadas'],
}

// ---- Emparejado de las columnas tal cual salen en Infloww (en inglés) con las métricas del CRM ----
// El orden importa: lo más específico primero. Cada columna solo se usa una vez.
const PATRONES = [
  ['tiempo_respuesta_prog_seg', /(response|reply|respuesta).*(schedul|program)|(schedul|program).*(response|reply|respuesta)/i, 't'],
  ['media_fan_gasto', /(avg|average|media|promedio).*(fan)|earnings?\s*per\s*(paying\s*)?fan|per\s*fan\s*who\s*spent/i, 'n'],
  ['fans_gastaron', /fans?\s*(who\s*)?(spent|paid|purchased|bought|tipped)|paying\s*fans|fans?.*(gastad|pagad|compr)/i, 'n'],
  ['fan_cvr', /\bcvr\b|conversion|conversi[oó]n/i, 'p'],
  ['caracteres', /character|char\.?\s*count|caracter/i, 'n'],
  ['tiempo_respuesta', /(response|reply|respuesta).*time|time.*(response|reply)|tiempo.*respuesta|respuesta/i, 't'],
]
export function aNumero(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = String(v).trim().replace(/[$€£%\s]/g, '')
  if (!t || t === '-' || t === '—') return null
  let mult = 1
  const m = t.match(/^([\d.,]+)([kKmM])$/)
  if (m) { t = m[1]; mult = /k/i.test(m[2]) ? 1e3 : 1e6 }
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n * mult : null
}
// Completa los campos que la IA no rellenó mirando las columnas crudas, y deja en «otras» las que no encajan
export function completarDesdeColumnas(c) {
  const out = { ...c }
  const cols = Array.isArray(c.columnas) ? c.columnas.filter((x) => x && x.columna) : []
  const usadas = new Set()
  for (const [clave, re, tipo] of PATRONES) {
    const col = cols.find((x, i) => !usadas.has(i) && re.test(x.columna))
    if (!col) continue
    usadas.add(cols.indexOf(col))
    const campo = clave === 'tiempo_respuesta' ? 'tiempo_respuesta' : clave === 'tiempo_respuesta_prog_seg' ? 'tiempo_respuesta_programadas' : clave
    const actual = out[campo]
    if (actual !== null && actual !== undefined && actual !== '') continue
    if (tipo === 't') out[campo] = String(col.valor || '').trim() || null
    else out[campo] = aNumero(col.valor)
  }
  const CONOCIDAS = /employee|name|nombre|group|sales|ventas|tips?\b|propina|message|mensaje|ppv|fans?\s*chat|clocked|hours|horas|golden|unlock/i
  out.otras = cols.filter((x, i) => !usadas.has(i) && !CONOCIDAS.test(x.columna))
  return out
}

// imagenes: [{mediaType, base64}] -> { fecha_inicio, fecha_fin, chatters:[...], notas }
export async function leerEstadisticasInflow(imagenes) {
  const contenido = imagenes.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } }))
  contenido.push({ type: 'text', text: `Extrae las estadísticas de cada chatter que se ven en ${imagenes.length > 1 ? 'estas capturas' : 'esta captura'}.` })
  let ultimo = null
  for (let n = 0; n < 3; n++) {
    try {
      const r = await iaCallJSON(SYSTEM, [{ role: 'user', content: contenido }], { tool_name: 'entregar_estadisticas', tool_description: 'Entrega las estadísticas de cada chatter leídas en las capturas de Infloww.', schema: SCHEMA }, 4000)
      if (r && Array.isArray(r.chatters)) return { fecha_inicio: r.fecha_inicio || '', fecha_fin: r.fecha_fin || '', chatters: r.chatters.map(completarDesdeColumnas), notas: r.notas || '', columnas: Array.isArray(r.columnas_detectadas) ? r.columnas_detectadas : [] }
      ultimo = new Error('La IA no devolvió un resultado válido.')
    } catch (e) { ultimo = e }
    await new Promise((res) => setTimeout(res, 1200))
  }
  throw ultimo || new Error('No se pudieron leer las capturas.')
}
