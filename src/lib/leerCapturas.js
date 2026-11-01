import { iaCallJSON, getInstruccionesIA, conInstrucciones, normalizarRespuesta } from './ai'

// Reduce la captura (los móviles hacen fotos de varios MB) y la pasa a JPEG en base64.
export function reducirImagen(file, max = 2000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve({ mediaType: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.88).split(',')[1], nombre: file.name || 'captura' })
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
Si no hay ningún pago visible, devuelve compras vacío.
IMPORTANTE: SIEMPRE debes entregar el resultado llamando a la herramienta, aunque la captura sea borrosa, esté cortada o no se vea ningún pago (en ese caso compras vacío y explícalo en "notas"). Lee con calma toda la imagen de arriba abajo antes de responder.`

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
  const system = conInstrucciones(SYSTEM, await getInstruccionesIA('turno'))
  let ultimo = null, recibido = ''
  const intentos = [8000, 8000, 4000] // si el servidor no admite tantos tokens, el último intento baja el tope
  for (let n = 0; n < intentos.length; n++) {
    try {
      const r = await iaCallJSON(system, [{ role: 'user', content: contenido }], { tool_name: 'entregar_ventas', tool_description: 'Entrega los pagos de fans leídos en las capturas.', schema: SCHEMA }, intentos[n])
      const ok = normalizarRespuesta(r, ['compras'])
      if (ok) return { compras: (ok.compras || []).map((c) => ({ fan: c.fan || '', user: c.user || '', monto: Number(c.monto) || 0, tipo: c.tipo === 'tip' ? 'tip' : 'ppv', dudoso: !!c.dudoso })), notas: ok.notas || '' }
      recibido = r === undefined || r === null ? 'respuesta vacía' : typeof r === 'object' ? 'campos: ' + (Object.keys(r).join(', ') || 'ninguno') : 'tipo ' + typeof r
      ultimo = new Error(`La IA no devolvió un resultado válido (${recibido}). Prueba otra vez o con una captura más nítida.`)
    } catch (e) { ultimo = e }
    await new Promise((res) => setTimeout(res, 1000 * (n + 1)))
  }
  throw ultimo || new Error('No se pudo leer la captura.')
}
