import { supabase } from './supabase'
import { reducirAdjunto } from './imagenesInforme'

// Videos de los reels de referencia de las planificaciones de Instagram (copia propia por si tumban el reel original).
// Se guardan en el bucket privado «ig-plan-videos» y en cada reel queda { path, nombre, size }.
export const BUCKET = 'ig-plan-videos'
export const MAX_MB = 50

// Archivos de los reels que ocupan espacio en el almacén: el video de cada reel y sus imágenes de aclaración
export const videosDe = (dias) => (dias || []).flatMap((d) => d.reels || []).flatMap((r) => [r.video, ...(Array.isArray(r.imagenes) ? r.imagenes : [])]).filter((v) => v && v.path)
export const quitarVideos = (dias) => (dias || []).map((d) => ({ ...d, reels: (d.reels || []).map((r) => { if (!r.video && !r.imagenes) return r; const { video: _v, imagenes: _i, ...resto } = r; return resto }) }))

export const MAX_IMG_MB = 10
// Imagen de aclaración de un reel: se reduce y se guarda como JPG en el mismo almacén
export async function subirImagenReel(file, cuentaId) {
  if (!file) return { error: 'No hay archivo.' }
  if (!/^image\//.test(file.type || '')) return { error: 'Ese archivo no es una imagen (usa JPG, PNG o WEBP).' }
  if (file.size > MAX_IMG_MB * 1024 * 1024) return { error: `La imagen pesa más de ${MAX_IMG_MB} MB.` }
  try {
    const blob = await reducirAdjunto(file)
    const path = `${cuentaId || 'general'}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (error) return { error: 'No se pudo subir la imagen: ' + error.message }
    return { imagen: { path, nombre: file.name || 'imagen.jpg', size: blob.size } }
  } catch (ex) { return { error: ex.message } }
}

export async function subirVideo(file, cuentaId) {
  if (!file) return { error: 'No hay archivo.' }
  if (!/^video\//.test(file.type || '')) return { error: 'Ese archivo no es un video (usa mp4, mov o webm).' }
  if (file.size > MAX_MB * 1024 * 1024) return { error: `El video pesa ${(file.size / 1048576).toFixed(0)} MB y el máximo es ${MAX_MB} MB. Comprímelo o recórtalo e inténtalo de nuevo.` }
  const ext = (String(file.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'
  const rnd = Math.random().toString(36).slice(2, 10)
  const path = `${cuentaId || 'general'}/${Date.now()}-${rnd}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    const falta = /bucket|not found|does not exist/i.test(error.message || '')
    return { error: falta ? 'Falta ejecutar la migración 93 en Supabase (almacén de videos).' : 'No se pudo subir el video: ' + error.message }
  }
  return { video: { path, nombre: file.name, size: file.size } }
}

export async function borrarVideos(paths) {
  const lista = [...new Set((paths || []).filter(Boolean))]
  if (!lista.length) return { ok: true, borrados: 0 }
  const { data, error } = await supabase.storage.from(BUCKET).remove(lista)
  if (error) return { ok: false, error: error.message }
  return { ok: true, borrados: (data || []).length, pedidos: lista.length }
}

// Descarga directa: URL firmada con «Content-Disposition: attachment», así el navegador baja el archivo solo (sin abrirlo en otra pestaña)
export async function descargarVideo(path, nombre) {
  const fichero = String(nombre || 'reel.mp4').replace(/[\\/:*?"<>|]+/g, '_')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: fichero })
  if (error || !data?.signedUrl) return { error: 'No se pudo preparar la descarga.' }
  const a = document.createElement('a')
  a.href = data.signedUrl; a.download = fichero; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  return { ok: true }
}

const cache = new Map() // path -> { url, hasta }
export async function urlVideo(path, forzar = false) {
  const c = cache.get(path)
  if (!forzar && c && c.hasta > Date.now()) return c.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 7200)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, hasta: Date.now() + 100 * 60 * 1000 })
  return data.signedUrl
}
