import { supabase } from './supabase'

export const BUCKET_INFORMES = 'informes-manager'
export const MAX_IMG_POR_APARTADO = 6

// Reduce la imagen (lado máximo 1800 px) y la pasa a JPG para que pese poco
export function reducirAdjunto(file, max = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen.'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen (usa JPG, PNG o WEBP).')) }
    img.src = url
  })
}

// Sube una imagen al almacén y devuelve { path, nombre }
export async function subirImagenInforme({ managerId, informeId, clave, file }) {
  const blob = await reducirAdjunto(file)
  const limpio = String(file.name || 'imagen').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'imagen'
  const path = `${managerId}/${informeId}/${String(clave).replace(/[^\w-]/g, '_')}/${Date.now()}-${limpio}.jpg`
  const { error } = await supabase.storage.from(BUCKET_INFORMES).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return { path, nombre: file.name || 'imagen.jpg' }
}

export async function urlImagenInforme(path, segundos = 3600) {
  const { data } = await supabase.storage.from(BUCKET_INFORMES).createSignedUrl(path, segundos)
  return data?.signedUrl || ''
}

export async function borrarImagenInforme(path) {
  await supabase.storage.from(BUCKET_INFORMES).remove([path])
}
