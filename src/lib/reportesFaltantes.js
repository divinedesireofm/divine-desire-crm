// Turnos trabajados (entrada y luego salida) cuyo reporte de turno nunca se envió.
// Un turno cuenta como «con reporte» si el chatter envió algún reporte desde que entró (y antes de su siguiente entrada)
// o si marcó «ya lo envié» en esa salida.
export const DIAS_REVISION = 14

export function calcularFaltantes({ eventos = [], reportes = [], acks = new Set(), ahora = Date.now() }) {
  const porChatter = {}
  eventos.forEach((e) => { (porChatter[e.chatter_id] = porChatter[e.chatter_id] || []).push(e) })
  const repsPor = {}
  reportes.forEach((r) => { (repsPor[r.chatter_id] = repsPor[r.chatter_id] || []).push(new Date(r.created_at).getTime()) })
  const faltan = []
  Object.entries(porChatter).forEach(([chatterId, evs]) => {
    evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let entrada = null
    evs.forEach((e, i) => {
      if (e.tipo === 'entrada') { entrada = e; return }
      if (e.tipo !== 'salida' || !entrada) return
      const ini = new Date(entrada.created_at).getTime()
      const sigEntrada = evs.slice(i + 1).find((x) => x.tipo === 'entrada')
      const fin = sigEntrada ? new Date(sigEntrada.created_at).getTime() : ahora + 1
      const tiene = acks.has(e.id) || (repsPor[chatterId] || []).some((t) => t >= ini && t < fin)
      if (!tiene) faltan.push({ chatterId, nombre: e.profiles?.full_name || entrada.profiles?.full_name || '—', entrada: entrada.created_at, salida: e.created_at, salidaId: e.id })
      entrada = null
    })
  })
  return faltan.sort((a, b) => new Date(b.salida) - new Date(a.salida))
}
