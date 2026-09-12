// Cuando una Edge Function devuelve un error, supabase-js normalmente solo da
// "Edge Function returned a non-2xx status code" en vez del mensaje real.
// Esto extrae el mensaje real del cuerpo de la respuesta.
export async function readFunctionError(error) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json()
      if (body?.error) return body.error
    }
  } catch (e) {}
  return error?.message || 'Error desconocido'
}
