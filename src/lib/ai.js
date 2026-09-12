import { supabase } from './supabase'

// Llama a la Edge Function "generate-ai", que a su vez llama a la API de Claude de forma segura.
export async function iaCall(system, messages, max_tokens) {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: { system, messages, max_tokens },
  })
  if (error) throw new Error(error.message || 'Error llamando a la IA.')
  if (data?.error) throw new Error(data.error)
  return data.text
}

// Extrae el primer JSON válido (objeto o array) de un texto, tolerando ```json ... ```
export function iaJson(text) {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()
  try { return JSON.parse(clean) } catch (e) {}
  const a = clean.indexOf('[')
  const o = clean.indexOf('{')
  let i = -1
  if (a >= 0 && (o < 0 || a < o)) i = a
  else if (o >= 0) i = o
  if (i < 0) throw new Error('La IA no devolvió JSON.')
  const last = clean.lastIndexOf(clean[i] === '[' ? ']' : '}')
  return JSON.parse(clean.slice(i, last + 1))
}
