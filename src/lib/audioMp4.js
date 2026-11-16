// Convierte un audio (mp3) a MP4 en el navegador, sin servidor. Intenta recodificar a AAC (el más compatible)
// y, si el navegador no puede, empaqueta el mp3 tal cual dentro del contenedor MP4.
export async function audioAMp4(blob) {
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } = await import('mediabunny')
  async function ejecutar(audio) {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const conv = await Conversion.init({ input, output, ...(audio ? { audio } : {}) })
    if (!conv.isValid) throw new Error('Conversión no válida')
    await conv.execute()
    return new Blob([target.buffer], { type: 'audio/mp4' })
  }
  try { return await ejecutar({ codec: 'aac' }) } catch (e) { return await ejecutar(null) }
}
