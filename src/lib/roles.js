import { supabase } from './supabase'

// Los extrabajadores (dados de baja) no deben aparecer en ningún selector ni listado de trabajo.
// Solo se conservan sus reportes y datos históricos.
export async function getExtrabajadorIds() {
  const { data, error } = await supabase.from('profiles').select('id').eq('extrabajador', true)
  if (error) return new Set() // si aún no existe la columna, no hay extrabajadores
  return new Set((data || []).map((p) => p.id))
}

// Devuelve los perfiles que tengan AL MENOS UNO de los roles indicados,
// aunque ese rol no sea el "principal" guardado en profiles.role. Nunca incluye extrabajadores.
export async function getProfilesByRoles(rolesList, { onlyActive = false } = {}) {
  const { data: ur } = await supabase.from('user_roles').select('user_id').in('role', rolesList)
  const ids = Array.from(new Set((ur || []).map((r) => r.user_id)))
  if (!ids.length) return []
  let q = supabase.from('profiles').select('id, full_name, role, active, extrabajador').in('id', ids)
  if (onlyActive) q = q.eq('active', true)
  let { data, error } = await q.order('full_name')
  if (error) { // por si la columna extrabajador aún no existe
    let q2 = supabase.from('profiles').select('id, full_name, role, active').in('id', ids)
    if (onlyActive) q2 = q2.eq('active', true)
    ;({ data } = await q2.order('full_name'))
  }
  return (data || []).filter((p) => !p.extrabajador)
}
