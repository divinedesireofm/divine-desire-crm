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

// Lectura ligera "en vivo": solo trae lo nuevo desde la última vez (2 peticiones a SLT). Si otra persona la lanzó hace
// menos de 40 s, devuelve en_cache y los números ya están guardados.
export async function enVivoSLT() {
  const { data, error } = await supabase.functions.invoke('slt-links', { body: { accion: 'live' } })
  if (error) throw new Error(await readFunctionError(error))
  if (!data?.ok) throw new Error(data?.error || 'No se pudo leer SLT en vivo.')
  return data
}
