// Catálogo de apartados del CRM. Lo usan el menú, el control de acceso y la tabla de permisos.
// `roles` son los permisos POR DEFECTO; el admin puede cambiarlos desde Equipo → Permisos.
export const SECTIONS = [
  {
    id: 'general',
    label: null, // sin cabecera, siempre visible arriba del todo
    items: [
      { to: '/', label: 'Panel general', icon: 'home', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo'], end: true },
      { to: '/asistente', label: 'Asistente IA', icon: 'sparkle', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/tareas', label: 'Tareas pendientes', icon: 'file', roles: ['admin'] },
      { to: '/fechas', label: 'Fechas importantes', icon: 'calendar', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo'] },
      { to: '/anuncios', label: 'Anuncios', icon: 'bell', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/recursos', label: 'Recursos', icon: 'file', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo'] },
      { to: '/novedades', label: 'Novedades', icon: 'bell', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo'] },
    ],
  },
  {
    id: 'chatting',
    label: 'Chatting',
    icon: 'chat',
    items: [
      { to: '/asistencia', label: 'Entradas y salidas', icon: 'clock', roles: ['admin', 'manager', 'chatter'] },
      { to: '/reportes-turno', label: 'Reportes de turno', icon: 'file', roles: ['admin', 'manager', 'chatter'] },
      { to: '/solicitudes', label: 'Solicitudes', icon: 'file', roles: ['admin', 'manager', 'chatter'] },
      { to: '/recaptaciones', label: 'Recaptaciones', icon: 'target', roles: ['admin', 'manager', 'chatter'] },
      { to: '/contenido', label: 'Contenido pedido', icon: 'package', roles: ['admin', 'manager'] },
      { to: '/solicitudes-modelos', label: 'Solicitudes de modelos', icon: 'sparkle', roles: ['admin', 'manager'] },
      { to: '/metricas-chatters', label: 'Métricas de chatters', icon: 'chart', roles: ['admin', 'manager'] },
      { to: '/rendimiento-360', label: 'Rendimiento 360', icon: 'chart', roles: ['admin', 'manager'] },
      { to: '/masivos', label: 'Masivos PPV', icon: 'calendar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/chatters', label: 'Chatters', icon: 'users', roles: ['admin', 'manager'] },
      { to: '/horarios', label: 'Horarios', icon: 'calendar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/pagos', label: 'Pagos', icon: 'dollar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/packs', label: 'Packs', icon: 'package', roles: ['admin', 'manager', 'chatter'] },
      { to: '/scripts', label: 'Scripts', icon: 'chat', roles: ['admin', 'manager', 'chatter'] },
      { to: '/activacion', label: 'Activación', icon: 'zap', roles: ['admin', 'manager', 'chatter'] },
      { to: '/precios', label: 'Precios', icon: 'tag', roles: ['admin', 'manager', 'chatter'] },
      { to: '/formacion', label: 'Formación', icon: 'book', roles: ['admin', 'manager'] },
      { to: '/voz-marca', label: 'Voz de marca (IA)', icon: 'chat', roles: ['admin', 'manager'] },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'camera',
    items: [
      { to: '/instagram', label: 'Cuentas de Instagram', icon: 'camera', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/reels', label: 'Envío de reels', icon: 'sparkle', roles: ['admin', 'ig_manager', 'ig_assistant', 'modelo'] },
      { to: '/planificaciones', label: 'Planificaciones', icon: 'calendar', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/lo-que-funciona', label: 'Lo que funciona', icon: 'chart', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/reels-referencia', label: 'Reels de referencia', icon: 'sparkle', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/trial-reels', label: 'Trial Reels', icon: 'target', roles: ['admin', 'ig_manager'] },
      { to: '/incidencias', label: 'Restricciones y apelaciones', icon: 'alert', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/proxies', label: 'Proxies', icon: 'package', roles: ['admin', 'ig_manager'] },
      { to: '/incentivos-ig', label: 'Incentivos de Instagram', icon: 'dollar', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/leads', label: 'Reclutamiento', icon: 'target', roles: ['admin', 'ig_manager'] },
      { to: '/reportes-ig', label: 'Reportes de Instagram', icon: 'file', roles: ['admin', 'ig_manager', 'ig_assistant'] },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestión',
    icon: 'users',
    items: [
      { to: '/equipo', label: 'Equipo', icon: 'users', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/sanciones', label: 'Sanciones', icon: 'alert', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/historial', label: 'Historial', icon: 'clock', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/bandeja-reportes', label: 'Bandeja de reportes', icon: 'file', roles: ['admin'] },
      { to: '/incidencias-modelos', label: 'Incidencias de modelos', icon: 'alert', roles: ['admin', 'manager'] },
    ],
  },
  {
    id: 'recursos',
    label: 'Recursos compartidos',
    icon: 'file',
    items: [
      { to: '/modelos', label: 'Modelos', icon: 'diamond', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/metricas', label: 'Métricas semanales', icon: 'chart', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/comparativa', label: 'Comparativa modelos', icon: 'chart', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/salud-of', label: 'Salud OF', icon: 'chart', roles: ['admin', 'manager', 'ig_manager'] },
    ],
  },
]

export const ROLES_EDITABLES = [
  { id: 'manager', label: 'Manager de Chatting' },
  { id: 'chatter', label: 'Chatter' },
  { id: 'ig_manager', label: 'Manager de Instagram' },
  { id: 'ig_assistant', label: 'Asistente IG' },
  { id: 'modelo', label: 'Modelo' },
]

// Aplica el orden que el admin ha guardado desde el propio menú.
// cfg = { sections: ['general','chatting',…], items: { general: ['/', '/fechas',…], … } }
// Lo que no esté en cfg (apartados nuevos) se queda en su sitio de siempre, al final de su categoría.
export function aplicarOrden(sections, cfg) {
  if (!cfg || typeof cfg !== 'object') return sections
  const porRuta = {}
  sections.forEach((s) => s.items.forEach((it) => { porRuta[it.to] = it }))
  const asignada = {} // ruta -> categoría (primera vez que aparece en cfg)
  const cfgItems = cfg.items || {}
  Object.keys(cfgItems).forEach((sid) => {
    if (!sections.some((s) => s.id === sid)) return
    ;(cfgItems[sid] || []).forEach((r) => { if (porRuta[r] && !asignada[r]) asignada[r] = sid })
  })
  const orden = cfg.sections || []
  const idx = (id) => { const i = orden.indexOf(id); return i < 0 ? 999 : i }
  return [...sections]
    .map((s, n) => ({ s, n }))
    .sort((a, b) => idx(a.s.id) - idx(b.s.id) || a.n - b.n)
    .map(({ s }) => {
      const propios = (cfgItems[s.id] || []).filter((r) => asignada[r] === s.id).map((r) => porRuta[r])
      const resto = s.items.filter((it) => !asignada[it.to])
      return { ...s, items: [...propios, ...resto] }
    })
}

export function buscarItem(pathname) {
  for (const s of SECTIONS) for (const it of s.items) if (it.to === pathname) return it
  return null
}
