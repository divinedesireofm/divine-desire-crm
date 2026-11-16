import { supabase } from './supabase'

// Pone el nombre de cada chatter (profiles.full_name) en las filas de «schedules».
// La tabla schedules tiene DOS relaciones con profiles (chatter_id y creado_por), así que pedir `profiles(full_name)` dentro de la
// misma consulta puede fallar por ambigüedad y dejar el cuadro vacío. Por eso los nombres se piden aparte.
export async function conNombres(filas) {
  const ids = [...new Set((filas || []).map((f) => f.chatter_id).filter(Boolean))]
  if (!ids.length) return filas || []
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const nombre = new Map((data || []).map((p) => [p.id, p.full_name]))
  return (filas || []).map((f) => ({ ...f, profiles: { full_name: nombre.get(f.chatter_id) || '—' } }))
}
