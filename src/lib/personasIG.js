// Nombres de personas del equipo de Instagram: los extrabajadores llevan siempre la etiqueta «(extrabajador)» junto a su nombre.
export const ETIQUETA_EXTRA = '(extrabajador)'
export const normNombre = (t) => String(t || '').replace(/\s*\(extrabajador\)\s*$/i, '').trim().toLowerCase()

// personas = grupos [{ grupo, items }] (los extrabajadores van en el grupo cuyo nombre empieza por «Extrabajadores»)
export function conjuntoExtrabajadores(personas = []) {
  return new Set(personas.filter((g) => /^extrabajadores/i.test(g.grupo)).flatMap((g) => g.items).map(normNombre))
}
// «Dario» -> «Dario (extrabajador)» si es un extrabajador; el resto, igual
export function conEtiqueta(valor, extras) {
  const v = String(valor ?? '').trim()
  if (!v || /\(extrabajador\)\s*$/i.test(v)) return v
  return extras && extras.has(normNombre(v)) ? `${v} ${ETIQUETA_EXTRA}` : v
}
