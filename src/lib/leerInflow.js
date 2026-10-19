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
   - tiempo_respuesta: tiempo de respuesta / Reply time, como texto exactamente como se ve (por ejemplo "2m 37s" o "00:02:37").
   - horas_trabajadas: horas trabajadas / Clocked hours, en horas decimales (si sale 7h 30m devuelve 7.5).
6. No devuelvas ratios (golden ratio, unlock ratio), la app los calcula sola. Ignora filas de totales o medias del equipo.
7. Si en las capturas se ve el rango de fechas del informe, devuélvelo en "fecha_inicio" y "fecha_fin" con formato AAAA-MM-DD (si el año no se ve, asume el año en curso). Si no se ve, deja ambos vacíos.
8. En "notas" escribe en una frase cualquier cosa que haya que revisar (columnas que no se leen, nombres cortados...). Si no hay nada, deja "".`

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
          horas_trabajadas: num,
        },
        required: ['nombre'],
      },
    },
    notas: { type: 'string' },
  },
  required: ['chatters', 'notas'],
}

// imagenes: [{mediaType, base64}] -> { fecha_inicio, fecha_fin, chatters:[...], notas }
export async function leerEstadisticasInflow(imagenes) {
  const contenido = imagenes.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } }))
  contenido.push({ type: 'text', text: `Extrae las estadísticas de cada chatter que se ven en ${imagenes.length > 1 ? 'estas capturas' : 'esta captura'}.` })
  let ultimo = null
  for (let n = 0; n < 3; n++) {
    try {
      const r = await iaCallJSON(SYSTEM, [{ role: 'user', content: contenido }], { tool_name: 'entregar_estadisticas', tool_description: 'Entrega las estadísticas de cada chatter leídas en las capturas de Infloww.', schema: SCHEMA }, 4000)
      if (r && Array.isArray(r.chatters)) return { fecha_inicio: r.fecha_inicio || '', fecha_fin: r.fecha_fin || '', chatters: r.chatters, notas: r.notas || '' }
      ultimo = new Error('La IA no devolvió un resultado válido.')
    } catch (e) { ultimo = e }
    await new Promise((res) => setTimeout(res, 1200))
  }
  throw ultimo || new Error('No se pudieron leer las capturas.')
}
