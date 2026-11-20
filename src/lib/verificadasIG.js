import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Usuarios (en minúsculas, sin @) de las cuentas de Instagram verificadas. Se pide una sola vez y se comparte entre todas las tablas.
let cache = null
let pendiente = null
const oyentes = new Set()

function cargar() {
  if (pendiente) return pendiente
  pendiente = Promise.resolve(supabase.from('instagram_accounts').select('username').eq('verificada', true).limit(5000))
    .then(({ data, error }) => { cache = new Set(error ? [] : (data || []).map((r) => String(r.username || '').replace(/^@+/, '').trim().toLowerCase()).filter(Boolean)) })
    .catch(() => { cache = new Set() })
    .finally(() => { pendiente = null; oyentes.forEach((f) => f(cache)) })
  return pendiente
}

// Vuelve a pedir la lista (tras actualizar métricas)
export function refrescarVerificadas() { return cargar() }

export function esVerificadaIG(set, usuario) {
  return !!set && set.has(String(usuario || '').replace(/^@+/, '').replace(/\/+$/, '').trim().toLowerCase())
}

export function useVerificadasIG() {
  const [set, setSet] = useState(cache)
  useEffect(() => {
    oyentes.add(setSet)
    if (!cache) cargar(); else setSet(cache)
    return () => { oyentes.delete(setSet) }
  }, [])
  return set
}
