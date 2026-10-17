import { iaCallJSON } from './ai'

// Reduce la captura (los móviles hacen fotos de varios MB) y la pasa a JPEG en base64.
export function reducirImagen(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve({ mediaType: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.8).split(',')[1], nombre: file.name || 'captura' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen. Prueba con otra captura (JPG o PNG).')) }
    img.src = url
  })
}

const SYSTEM = `Eres un asistente que lee capturas de pantalla de ventas de OnlyFans (Infloww / chat de OnlyFans / listado de transacciones o estadísticas) de una agencia. Te pasan una o varias capturas del mismo turno de trabajo. Extrae CADA pago que haya hecho un fan: mensajes de pago (PPV) desbloqueados, propinas (tips) y otros cobros.
Reglas:
1. Una entrada por cada pago. Si un mismo fan paga varias veces, devuelve una entrada por pago (no los sumes).
2. "fan" es el nombre visible del fan y "user" su @usuario tal como aparece (con @). Si solo se ve uno de los dos, deja el otro vacío (user vacío = ""). Nunca inventes datos.
3. "monto" es el importe en dólares que aparece junto al pago, como número (sin símbolo). Si la captura muestra importe bruto y neto, usa el que se muestre como importe del pago (sin descontar nada tú).
4. "tipo": "tip" si pone tip/propina; en cualquier otro pago (mensaje de pago desbloqueado, PPV, suscripción, renovación) usa "ppv".
5. Si varias capturas se solapan (misma conversación desplazada), NO dupliques el mismo pago: cuéntalo una vez.
6. Marca "dudoso": true si algún dato (importe o usuario) no se lee bien o lo has tenido que deducir.
7. Ignora mensajes normales sin pago, importes que no son pagos de fans y totales/resúmenes.
8. En "notas" escribe en una frase cualquier cosa que el chatter deba revisar (p. ej. "no se ve el usuario del último pago"). Si no hay nada, deja "".
Si no hay ningún pago visible, devuelve compras vacío.`

const SCHEMA = {
  type: 'object',
  properties: {
    compras: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fan: { type: 'string' },
          user: { type: 'string' },
          monto: { type: 'number' },
          tipo: { type: 'string', enum: ['ppv', 'tip'] },
          dudoso: { type: 'boolean' },
        },
        required: ['fan', 'user', 'monto', 'tipo', 'dudoso'],
      },
    },
    notas: { type: 'string' },
  },
  required: ['compras', 'notas'],
}

// imagenes: [{mediaType, base64}] -> { compras:[{fan,user,monto,tipo,dudoso}], notas }
export async function leerVentasDeCapturas(imagenes, modelo) {
  const contenido = imagenes.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } }))
  contenido.push({ type: 'text', text: `Modelo: ${modelo || 'sin indicar'}. Extrae todos los pagos de fans que se ven en ${imagenes.length > 1 ? 'estas capturas' : 'esta captura'}.` })
  let ultimo = null
  for (let n = 0; n < 2; n++) { // un reintento por si la primera llamada llega vacía o falla
    try {
      const r = await iaCallJSON(SYSTEM, [{ role: 'user', content: contenido }], { tool_name: 'entregar_ventas', tool_description: 'Entrega los pagos de fans leídos en las capturas.', schema: SCHEMA }, 4000)
      if (r && Array.isArray(r.compras)) return { compras: r.compras, notas: r.notas || '' }
      ultimo = new Error('La IA no devolvió un resultado válido.')
    } catch (e) { ultimo = e }
  }
  throw ultimo || new Error('No se pudo leer la captura.')
}
