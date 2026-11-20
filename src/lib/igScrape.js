import { supabase } from './supabase'
import { readFunctionError } from './functions'

// Ajustes de créditos y de la lectura automática. Sin la migración 145 devuelve «falta»; sin la 146 solo hay tope y aviso.
export async function ajustesCreditosIG() {
  const base = { tope: null, aviso: null, auto: { activo: false, cadaDias: 7, hora: 8, reels: 'novedad', ultima: null, resultado: null }, falta: false, faltaAuto: false }
  try {
    const { data, error } = await supabase.from('ig_creditos_ajustes').select('*').eq('id', 1).maybeSingle()
    if (error) return { ...base, falta: true, faltaAuto: true }
    if (!data) return { ...base, falta: true, faltaAuto: true }
    return {
      ...base, tope: data.tope_mensual ?? null, aviso: data.aviso_saldo ?? null, faltaAuto: !('auto_activo' in data),
      auto: { activo: !!data.auto_activo, cadaDias: data.auto_cada_dias ?? 7, hora: data.auto_hora ?? 8, reels: data.auto_reels || 'novedad', ultima: data.auto_ultima_ejecucion || null, resultado: data.auto_ultimo_resultado || null },
    }
  } catch (_e) { return { ...base, falta: true, faltaAuto: true } }
}

// Guarda tope, aviso y (si hay migración 146) la configuración de la lectura automática
export async function guardarAjustesCreditosIG({ tope, aviso, auto }) {
  const cambios = { tope_mensual: tope, aviso_saldo: aviso, updated_at: new Date().toISOString() }
  if (auto) Object.assign(cambios, { auto_activo: !!auto.activo, auto_cada_dias: auto.cadaDias, auto_hora: auto.hora, auto_reels: auto.reels })
  const { error } = await supabase.from('ig_creditos_ajustes').update(cambios).eq('id', 1)
  if (error) throw new Error(/ig_creditos_ajustes|relation|auto_/i.test(error.message) ? 'Falta ejecutar la migración 145 y la 146 en Supabase.' : error.message)
}

// Créditos gastados desde el CRM en el mes natural actual
export async function gastoMesIG() {
  const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0)
  try {
    const { data, error } = await supabase.from('ig_creditos_log').select('creditos').gte('created_at', ini.toISOString()).limit(20000)
    if (error) return 0
    return (data || []).reduce((a, r) => a + (Number(r.creditos) || 0), 0)
  } catch (_e) { return 0 }
}

// Pide a la función "ig-scrape" que lea los perfiles con ScrapeCreators y guarde sus métricas.
// ids = lista de cuentas (vacío = todas las activas). estimado = créditos que se prevé gastar (para comprobar el tope mensual).
// Devuelve { resultados, creditos_restantes, creditos_gastados }.
export async function actualizarMetricasIG(ids = [], { reels = true, estimado } = {}) {
  const prev = estimado ?? Math.max(1, ids.length) * (reels ? 2 : 1)
  const aj = await ajustesCreditosIG()
  if (aj.tope != null) {
    const gastado = await gastoMesIG()
    if (gastado + prev > aj.tope) {
      throw new Error(`Tope mensual alcanzado: llevas ${gastado} de ${aj.tope} créditos este mes y esta lectura gastaría unos ${prev}. Sube el tope en «Tope mensual de créditos» si quieres seguir.`)
    }
  }
  const { data, error } = await supabase.functions.invoke('ig-scrape', { body: { account_ids: ids, reels } })
  if (error) throw new Error(await readFunctionError(error))
  if (!data?.ok) throw new Error(data?.error || 'No se pudieron actualizar las métricas.')
  // Se apunta lo gastado para llevar la cuenta del mes (si falla el apunte, no pasa nada)
  const gastados = Number(data.creditos_gastados) || 0
  if (gastados > 0) Promise.resolve(supabase.from('ig_creditos_log').insert({ creditos: gastados, cuentas: (data.resultados || []).length })).then(() => {}, () => {})
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
