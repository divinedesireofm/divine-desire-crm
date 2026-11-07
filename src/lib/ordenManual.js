import { supabase } from './supabase'

// Mueve una fila a la posición de otra dentro de una lista ya ordenada por `orden`.
// Solo reasigna los valores de `orden` de las filas afectadas (los mismos números, en otra posición), así se mantienen únicos.
// Devuelve { lista, cambios } — lista: filas reordenadas con su nuevo orden; cambios: [{id, orden}] a guardar.
export function moverFila(lista, desdeId, haciaId) {
  const i = lista.findIndex((r) => r.id === desdeId)
  const j = lista.findIndex((r) => r.id === haciaId)
  if (i < 0 || j < 0 || i === j) return { lista, cambios: [] }
  const a = Math.min(i, j), b = Math.max(i, j)
  const slots = lista.slice(a, b + 1).map((r) => r.orden)
  // por si alguna fila no tenía número de orden todavía
  const base = Math.max(0, ...lista.map((r) => Number(r.orden) || 0))
  const huecos = slots.map((s, k) => (s == null ? base + k + 1 : s))
  const nueva = lista.slice()
  const [x] = nueva.splice(i, 1)
  nueva.splice(j, 0, x)
  const cambios = []
  for (let k = a; k <= b; k++) {
    const orden = huecos[k - a]
    if (nueva[k].orden !== orden) { nueva[k] = { ...nueva[k], orden }; cambios.push({ id: nueva[k].id, orden }) }
  }
  return { lista: nueva, cambios }
}

export async function guardarOrden(tabla, cambios) {
  const res = await Promise.all(cambios.map((c) => supabase.from(tabla).update({ orden: c.orden }).eq('id', c.id)))
  return res.find((r) => r.error)?.error || null
}
