import { supabase } from './supabase'
import { readFunctionError } from './functions'

// Pide a la función "ig-scrape" que lea los perfiles con ScrapeCreators y guarde sus métricas.
// ids = lista de cuentas (vacío = todas las activas). Devuelve { resultados, creditos_restantes, creditos_gastados }.
export async function actualizarMetricasIG(ids = [], { reels = true } = {}) {
  const { data, error } = await supabase.functions.invoke('ig-scrape', { body: { account_ids: ids, reels } })
  if (error) throw new Error(await readFunctionError(error))
  if (!data?.ok) throw new Error(data?.error || 'No se pudieron actualizar las métricas.')
  return data
}
