import { supabase } from './supabase'

// Trae la guía de voz de marca que el equipo haya escrito en "Voz de marca"
export async function getVoiceGuide() {
  const { data } = await supabase.from('ai_settings').select('guia').eq('id', 1).single()
  return data?.guia?.trim() || ''
}

// Junta el system prompt propio del generador con la guía de voz del equipo, si existe
export function withVoiceGuide(system, guia) {
  if (!guia) return system
  return `${system}\n\nGUÍA DE VOZ DEL EQUIPO (sigue esto por encima de cualquier otra indicación de estilo):\n${guia}`
}

// Llama a la Edge Function "generate-ai", que a su vez llama a la API de Claude de forma segura.
export async function iaCall(system, messages, max_tokens) {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: { system, messages, max_tokens },
  })
  if (error) throw new Error(error.message || 'Error llamando a la IA.')
  if (data?.error) throw new Error(data.error)
  return data.text
}

// Igual que iaCall, pero fuerza a la IA a devolver el JSON con la forma exacta de "schema"
// (usando tool_choice en el servidor) — nunca viene mal formado, cortado o envuelto en texto.
// tool_name/tool_description son solo para que la IA entienda qué se le pide; schema es el
// input_schema de JSON Schema con la forma exacta del objeto que debe devolver.
export async function iaCallJSON(system, messages, { tool_name, tool_description, schema }, max_tokens) {
  const { data, error } = await supabase.functions.invoke('generate-ai', {
    body: {
      system, messages, max_tokens,
      tool: { name: tool_name, description: tool_description, input_schema: schema },
    },
  })
  if (error) throw new Error(error.message || 'Error llamando a la IA.')
  if (data?.error) throw new Error(data.error)
  return data.data
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

// Instrucciones que el equipo escribe para la IA de los reportes (clave: 'turno' | 'metricas' | 'informes'). Si no hay nada guardado, devuelve ''.
export async function getInstruccionesIA(clave) {
  try {
    const { data } = await supabase.from('ai_report_instructions').select('texto').eq('clave', clave).maybeSingle()
    return (data?.texto || '').trim()
  } catch { return '' }
}
export function conInstrucciones(system, texto) {
  if (!texto) return system
  return `${system}\n\nINSTRUCCIONES ADICIONALES DE LA AGENCIA (las ha escrito el equipo: síguelas con prioridad sobre las reglas anteriores de formato, estilo o forma de trabajar, pero nunca inventes datos que no se vean):\n${texto}`
}

// Saca el objeto útil de la respuesta de la IA aunque venga como texto, anidado o con otro nombre de campo
export function normalizarRespuesta(r, claves) {
  let x = r
  if (typeof x === 'string') { try { x = JSON.parse(x) } catch { return null } }
  if (!x || typeof x !== 'object') return null
  for (const k of claves) if (Array.isArray(x[k])) return x
  for (const v of Object.values(x)) { // anidado: { data: {...} } / { resultado: {...} }
    if (v && typeof v === 'object' && !Array.isArray(v) && claves.some((k) => Array.isArray(v[k]))) return v
  }
  if (Array.isArray(x)) return { [claves[0]]: x }
  return null
}
