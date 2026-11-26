// Comprime un video en el propio navegador antes de subirlo (WebCodecs): 720 px de lado corto, H.264 y audio AAC.
// Garantía de calidad: nunca baja de ~1 Mbps (a 720p se ve bien en el móvil) y nunca sube el peso del original.
// Si algo no es posible (navegador sin soporte, formato raro, error) se devuelve el archivo ORIGINAL sin tocar.

export const LADO_CORTO_MAX = 720          // un reel 1080x1920 pasa a 720x1280
export const BITRATE_OBJETIVO = 1_600_000  // bits/s de video (≈ 12 MB por minuto)
export const BITRATE_MINIMO = 900_000      // por debajo de esto no se comprime más: se perdería calidad
export const AUDIO_BITRATE = 96_000
export const FPS_MAX = 30

const par = (n) => Math.max(2, Math.round(n / 2) * 2)   // H.264 necesita medidas pares

// Calcula lo que se haría con este video (separado para poder probarlo)
export function planCompresion({ size, duracion, ancho, alto, fps }) {
  const origBitrate = duracion > 0 ? (size * 8) / duracion : 0
  const corto = Math.min(ancho, alto)
  const k = corto > LADO_CORTO_MAX ? LADO_CORTO_MAX / corto : 1
  const salida = ancho <= alto ? { width: par(ancho * k) } : { height: par(alto * k) }
  const bitrate = Math.round(Math.min(BITRATE_OBJETIVO, origBitrate * 0.85))
  // Ya es ligero (pequeño, o resolución y bitrate bajos): comprimirlo otra vez solo lo estropearía
  const yaLigero = size <= 2.5 * 1048576 || (k === 1 && origBitrate <= BITRATE_OBJETIVO * 1.25) || bitrate < BITRATE_MINIMO
  return { origBitrate, k, salida, bitrate: Math.max(bitrate, BITRATE_MINIMO), fps: fps > FPS_MAX + 1 ? FPS_MAX : null, comprimir: !yaLigero }
}

// Devuelve { file, comprimido, antes, despues, motivo }. onProgreso(0..1). codecs solo se cambia en las pruebas.
export async function comprimirVideo(file, onProgreso, { codecs = ['avc'] } = {}) {
  const original = (motivo) => ({ file, comprimido: false, antes: file.size, despues: file.size, motivo })
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return original('Este navegador no puede comprimir video; se sube tal cual.')
  let conv = null
  try {
    const mb = await import('mediabunny')
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
    const vt = await input.getPrimaryVideoTrack()
    if (!vt) return original('No se encontró pista de video.')
    const duracion = await input.computeDuration()
    let fps = 0
    try { fps = (await vt.computePacketStats(60)).averagePacketRate } catch (_e) { /* sin dato de fps */ }
    const plan = planCompresion({ size: file.size, duracion, ancho: vt.displayWidth, alto: vt.displayHeight, fps })
    if (!plan.comprimir) return original('Ya es ligero; se sube sin recomprimir.')

    const w = plan.salida.width || Math.round(vt.displayWidth * (plan.salida.height / vt.displayHeight))
    const h = plan.salida.height || Math.round(vt.displayHeight * (plan.salida.width / vt.displayWidth))
    const codec = await mb.getFirstEncodableVideoCodec(codecs, { width: par(w), height: par(h), bitrate: plan.bitrate })
    if (!codec) return original('Este navegador no puede crear video H.264; se sube tal cual.')

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
    // Audio: se recomprime a AAC 96 kbps si el navegador sabe; si no, se copia tal cual (nunca se pierde el sonido)
    const at = await input.getPrimaryAudioTrack()
    let audio = {}
    try { if (at && await mb.canEncodeAudio('aac', { bitrate: AUDIO_BITRATE })) audio = { codec: 'aac', bitrate: AUDIO_BITRATE, numberOfChannels: 2 } } catch (_e) { /* se copia */ }
    conv = await mb.Conversion.init({
      input, output,
      video: { ...plan.salida, codec, bitrate: plan.bitrate, ...(plan.fps ? { frameRate: plan.fps } : {}), fit: 'contain' },
      audio,
    })
    if (!conv.isValid) return original('No se pudo preparar la compresión; se sube tal cual.')
    // Si el video tenía sonido y no cabe en el resultado, mejor subir el original que dejarlo mudo
    if (at && conv.discardedTracks.some((d) => d.track === at)) { await conv.cancel(); return original('No se pudo conservar el audio al comprimir; se sube tal cual.') }
    if (onProgreso) conv.onProgress = (p) => onProgreso(Math.min(1, p))
    await conv.execute()
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' })
    if (!blob.size || blob.size >= file.size * 0.95) return original('La compresión no ahorraba espacio; se sube el original.')
    const nombre = String(file.name || 'video').replace(/\.[^.]+$/, '') + '.mp4'
    return { file: new File([blob], nombre, { type: 'video/mp4' }), comprimido: true, antes: file.size, despues: blob.size, motivo: '' }
  } catch (e) {
    try { await conv?.cancel() } catch (_e) { /* nada */ }
    return original('No se pudo comprimir (' + (e?.message || 'error') + '); se sube tal cual.')
  }
}
