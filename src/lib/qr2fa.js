import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { reducirAdjunto } from './imagenesInforme'

// Foto del QR del 2FA de cada cuenta de Instagram. Se guarda UNA vez por usuario de Instagram, así que
// General, Cuentas propias y Eliminadas ven siempre la misma imagen: si la subes en una, aparece en las demás.
export const BUCKET_QR = 'qr-2fa'
export const claveQr = (usuario) => String(usuario || '').trim().replace(/^@/, '').toLowerCase()

let mapa = new Map()          // clave -> path
let cargado = false
const oyentes = new Set()
const avisar = () => oyentes.forEach((f) => f())

export async function cargarQr() {
  const { data, error } = await supabase.from('ig_qr_2fa').select('usuario, path').limit(5000)
  if (error) return error
  mapa = new Map((data || []).map((r) => [r.usuario, r.path]))
  cargado = true
  avisar()
  return null
}

export function useQr() {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((n) => n + 1)
    oyentes.add(f)
    cargarQr()
    return () => { oyentes.delete(f) }
  }, [])
  return { path: (usuario) => mapa.get(claveQr(usuario)) || null, cargado }
}

const cacheUrl = new Map()
export async function urlQr(path) {
  const c = cacheUrl.get(path)
  if (c && c.hasta > Date.now()) return c.url
  const { data } = await supabase.storage.from(BUCKET_QR).createSignedUrl(path, 3600)
  if (!data?.signedUrl) return ''
  cacheUrl.set(path, { url: data.signedUrl, hasta: Date.now() + 50 * 60000 })
  return data.signedUrl
}

export async function guardarQr(usuario, file, perfilId) {
  const clave = claveQr(usuario)
  if (!clave) throw new Error('Falta el usuario de Instagram.')
  if (!/^image\//.test(file.type || '')) throw new Error('Ese archivo no es una imagen (usa JPG, PNG o WEBP).')
  const blob = await reducirAdjunto(file, 1200)
  const path = `${clave}/${Date.now()}.jpg`
  const { error: e1 } = await supabase.storage.from(BUCKET_QR).upload(path, blob, { contentType: 'image/jpeg' })
  if (e1) throw new Error(/bucket|not found/i.test(e1.message) ? 'Falta ejecutar la migración 112 en Supabase.' : e1.message)
  const previo = mapa.get(clave)
  const { error: e2 } = await supabase.from('ig_qr_2fa').upsert({ usuario: clave, path, actualizado_por: perfilId || null, updated_at: new Date().toISOString() }, { onConflict: 'usuario' })
  if (e2) { await supabase.storage.from(BUCKET_QR).remove([path]); throw new Error(e2.message) }
  if (previo) supabase.storage.from(BUCKET_QR).remove([previo])
  mapa.set(clave, path); avisar()
}

export async function quitarQr(usuario) {
  const clave = claveQr(usuario)
  const previo = mapa.get(clave)
  const { error } = await supabase.from('ig_qr_2fa').delete().eq('usuario', clave)
  if (error) throw new Error(error.message)
  if (previo) supabase.storage.from(BUCKET_QR).remove([previo])
  mapa.delete(clave); avisar()
}
