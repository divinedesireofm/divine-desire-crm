import { supabase } from './supabase'
import { readFunctionError } from './functions'

// Pide a la función "slt-links" que lea SLT (páginas, enlaces, vistas y clicks) y lo guarde en las tablas slt_*.
// forzar = true salta el descanso de 5 minutos entre lecturas.
export async function actualizarEnlacesSLT(forzar = false) {
  const { data, error } = await supabase.functions.invoke('slt-links', { body: { forzar } })
  if (error) throw new Error(await readFunctionError(error))
  if (!data?.ok) throw new Error(data?.error || 'No se pudieron actualizar los enlaces.')
  return data
}
