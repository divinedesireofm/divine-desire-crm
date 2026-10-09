import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Caché compartida: se cargan una sola vez las fotos de todas las modelos y se reutilizan en todas las pantallas.
let mapa = null            // { 'Nombre artístico': 'https://…/foto.jpg' }
let cargando = null
const oyentes = new Set()

async function cargar() {
  const { data } = await supabase.from('models').select('stage_name, photo_url')
  const m = {}
  ;(data || []).forEach((r) => { if (r.stage_name) m[r.stage_name] = r.photo_url || null })
  mapa = m
  oyentes.forEach((f) => f(m))
  return m
}

export function refrescarFotosModelos() {
  cargando = cargar()
  return cargando
}

export function useFotosModelos() {
  const [m, setM] = useState(mapa || {})
  useEffect(() => {
    oyentes.add(setM)
    if (mapa) setM(mapa)
    else {
      if (!cargando) cargando = cargar()
    }
    return () => { oyentes.delete(setM) }
  }, [])
  return m
}

// Reduce la imagen a un cuadrado de 256 px (recorte centrado) para que pese poco.
export function reducirImagen(file, lado = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const s = Math.min(img.width, img.height)
      const c = document.createElement('canvas')
      c.width = lado; c.height = lado
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El archivo no es una imagen válida')) }
    img.src = url
  })
}
