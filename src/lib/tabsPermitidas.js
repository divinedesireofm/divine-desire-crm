import { useAuth } from '../context/AuthContext'

// Filtra las pestañas de un apartado según Equipo → Permisos.
// lista: [[id, etiqueta], …] · devuelve las permitidas y la pestaña activa (si la elegida no se puede ver, la primera permitida).
export function useTabsPermitidas(ruta, lista, seleccionada) {
  const { puedeTab } = useAuth()
  const permitidas = lista.filter(([id]) => puedeTab(ruta, id))
  const actual = permitidas.some(([id]) => id === seleccionada) ? seleccionada : (permitidas[0]?.[0] ?? null)
  return { permitidas, actual, puede: (id) => permitidas.some(([i]) => i === id) }
}
