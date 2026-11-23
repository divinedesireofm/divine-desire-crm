import { supabase } from './supabase'

export const BUCKET_FANS = 'fans-archivos'
export const MAX_MB_ARCHIVO = 25
export const ETIQUETAS_BASE = ['Ballena', 'VIP', 'Favorito', 'Pide personalizados', 'Regatea', 'Impago / problemas', 'Hablar con cuidado', 'Recuperar']

// @Usuario → usuario (minúsculas, sin @): es la clave de la ficha
export const claveFan = (user) => String(user || '').trim().toLowerCase().replace(/^@+/, '')

export async function subirArchivoFan({ fanKey, file, userId }) {
  if (file.size > MAX_MB_ARCHIVO * 1024 * 1024) throw new Error(`«${file.name}» pesa más de ${MAX_MB_ARCHIVO} MB.`)
  const limpio = String(file.name || 'archivo').replace(/[^\w.-]+/g, '_').slice(-80) || 'archivo'
  const path = `${fanKey.replace(/[^\w.-]/g, '_')}/${Date.now()}-${limpio}`
  const { error } = await supabase.storage.from(BUCKET_FANS).upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw new Error(error.message)
  const { data, error: e2 } = await supabase.from('fan_archivos').insert({ fan_key: fanKey, path, nombre: file.name || limpio, mime: file.type || '', bytes: file.size, subido_por: userId }).select().single()
  if (e2) { await supabase.storage.from(BUCKET_FANS).remove([path]); throw new Error(e2.message) }
  return data
}
export async function urlArchivoFan(path, segundos = 3600) {
  const { data } = await supabase.storage.from(BUCKET_FANS).createSignedUrl(path, segundos)
  return data?.signedUrl || ''
}
export async function borrarArchivoFan(a) {
  await supabase.storage.from(BUCKET_FANS).remove([a.path])
  return supabase.from('fan_archivos').delete().eq('id', a.id)
}
