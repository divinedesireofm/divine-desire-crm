import { supabase } from './supabase'

// Devuelve los perfiles que tengan AL MENOS UNO de los roles indicados,
// aunque ese rol no sea el "principal" guardado en profiles.role.
export async function getProfilesByRoles(rolesList, { onlyActive = false } = {}) {
  const { data: ur } = await supabase.from('user_roles').select('user_id').in('role', rolesList)
  const ids = Array.from(new Set((ur || []).map((r) => r.user_id)))
  if (!ids.length) return []
  let q = supabase.from('profiles').select('id, full_name, role, active').in('id', ids)
  if (onlyActive) q = q.eq('active', true)
  const { data } = await q.order('full_name')
  return data || []
}
