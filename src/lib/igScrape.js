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

// Saldo actual de créditos de ScrapeCreators (función aparte «ig-credits»; no lee ningún perfil). Devuelve { creditos, consultado }.
export async function consultarCreditosIG() {
  const { data, error } = await supabase.functions.invoke('ig-credits', { body: {} })
  if (error) {
    const msg = await readFunctionError(error)
    throw new Error(/not found|404|Failed to send|non-2xx/i.test(String(msg)) ? 'Falta desplegar la función «ig-credits» en Supabase.' : msg)
  }
  if (!data?.ok) throw new Error(data?.error || 'No se pudo consultar el saldo.')
  return data
}
