// MiniMax solo acepta mp3, m4a y wav para clonar una voz. Los audios ogg/opus (p. ej. notas de voz de WhatsApp)
// se decodifican en el navegador y se convierten a WAV mono de 24 kHz (≈ 2,9 MB por minuto; 5 min caben en el límite de 20 MB).
export const esOgg = (nombre) => /\.(ogg|oga|opus)$/i.test(nombre || '')

function aWavBlob(muestras, sampleRate) {
  const n = muestras.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  txt(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, muestras[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true) }
  return new Blob([buf], { type: 'audio/wav' })
}

// Devuelve { blob, duracion } con el audio convertido a WAV mono 24 kHz
export async function oggAWav(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) throw new Error('Este navegador no puede convertir audios ogg. Prueba con Chrome o sube un mp3/wav.')
  const ctx = new Ctx()
  let decodificado
  try { decodificado = await ctx.decodeAudioData(await file.arrayBuffer()) } catch { throw new Error(`No se pudo leer «${file.name}». Si es un ogg poco habitual, conviértelo a mp3 o wav.`) } finally { ctx.close?.() }
  const SR = 24000
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decodificado.duration * SR)), SR) // mezcla a mono y remuestrea
  const src = off.createBufferSource(); src.buffer = decodificado; src.connect(off.destination); src.start()
  const render = await off.startRendering()
  return { blob: aWavBlob(render.getChannelData(0), SR), duracion: decodificado.duration }
}
