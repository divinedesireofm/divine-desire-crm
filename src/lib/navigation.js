// Catálogo de apartados del CRM. Lo usan el menú, el control de acceso y la tabla de permisos.
// `roles` son los permisos POR DEFECTO; el admin puede cambiarlos desde Equipo → Permisos.
export const SECTIONS = [
  {
    id: 'general',
    label: null, // sin cabecera, siempre visible arriba del todo
    items: [
      { to: '/', label: 'Panel general', icon: 'home', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'reddit_manager', 'reddit_assistant'], end: true },
      { to: '/asistente', label: 'Asistente IA', icon: 'sparkle', roles: ['admin', 'manager', 'ig_manager'] },
      { to: '/tareas', label: 'Tareas pendientes', icon: 'file', roles: ['admin'] },
      { to: '/fechas', label: 'Fechas importantes', icon: 'calendar', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/anuncios', label: 'Anuncios', icon: 'bell', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/recursos', label: 'Recursos', icon: 'file', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/normas', label: 'Normas y reglas', icon: 'alert', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] },
      { to: '/novedades', label: 'Novedades', icon: 'bell', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant'] }
      ,{ to: '/mis-planificaciones', label: 'Planificaciones', icon: 'calendar', roles: ['modelo'], soloModelo: true },
      { to: '/mi-perfil', label: 'Mi perfil', icon: 'diamond', roles: ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'reddit_manager', 'reddit_assistant', 'planner', 'masivos', 'modelo'] },
    ],
  },
  {
    id: 'chatting',
    label: 'Chatting',
    icon: 'chat',
    items: [
      { to: '/asistencia', label: 'Entradas y salidas', icon: 'clock', roles: ['admin', 'manager', 'chatter'] },
      { to: '/reportes-turno', label: 'Reportes de turno', icon: 'file', roles: ['admin', 'manager', 'chatter'] },
      { to: '/solicitudes', label: 'Solicitudes personalizadas', icon: 'file', roles: ['admin', 'manager', 'chatter'] },
      { to: '/recaptaciones', label: 'Recaptaciones', icon: 'target', roles: ['admin', 'manager', 'chatter'] },
      { to: '/contenido', label: 'Contenido pedido', icon: 'package', roles: ['admin', 'manager'] },
      { to: '/solicitudes-modelos', label: 'Solicitudes de modelos', icon: 'sparkle', roles: ['admin', 'manager'] },
      { to: '/metricas-chatters', label: 'Métricas de chatters', icon: 'chart', roles: ['admin', 'manager'] },
      { to: '/informes-manager', label: 'Informes del manager', icon: 'file', roles: ['admin', 'manager'], soloRoles: ['admin', 'manager'] },
      { to: '/rendimiento-360', label: 'Rendimiento 360', icon: 'chart', roles: ['admin', 'manager'] },
      { to: '/masivos', label: 'Calendario de masivos', icon: 'calendar', roles: ['admin', 'manager', 'chatter', 'masivos'] },
      { to: '/chatters', label: 'Chatters', icon: 'users', roles: ['admin', 'manager'] },
      { to: '/horarios', label: 'Horarios', icon: 'calendar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/pagos', label: 'Pagos', icon: 'dollar', roles: ['admin', 'manager', 'chatter'] },
      { to: '/packs', label: 'Packs', icon: 'package', roles: ['admin', 'manager', 'chatter'] },
      { to: '/scripts', label: 'Scripts', icon: 'chat', roles: ['admin', 'manager', 'chatter'] },
      { to: '/audios', label: 'Audios', icon: 'sparkle', roles: ['admin', 'manager'] },
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
      { to: '/reels', label: 'Envío de reels', icon: 'sparkle', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/informes-manager-ig', label: 'Informes del manager', icon: 'file', roles: ['admin', 'ig_manager'], soloRoles: ['admin', 'ig_manager'] },
      { to: '/planificaciones', label: 'Planificaciones', icon: 'calendar', roles: ['admin', 'ig_manager', 'ig_assistant', 'planner'] },
      { to: '/enlaces', label: 'Enlaces', icon: 'target', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/lo-que-funciona', label: 'Lo que funciona', icon: 'chart', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/reels-referencia', label: 'Reels de referencia', icon: 'sparkle', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/trial-reels', label: 'Trial Reels', icon: 'target', roles: ['admin', 'ig_manager'] },
      { to: '/incidencias', label: 'Restricciones y apelaciones', icon: 'alert', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: '/proxies', label: 'Proxies', icon: 'package', roles: ['admin', 'ig_manager'] },
      { to: '/pagos-instagram', label: 'Pagos Instagram', icon: 'dollar', roles: ['admin', 'ig_manager', 'ig_assistant'] },
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
    id: 'reddit',
    label: 'Reddit',
    icon: 'target',
    items: [
      { to: '/reddit/cuentas', label: 'Cuentas de Reddit', icon: 'users', roles: ['admin', 'reddit_manager', 'reddit_assistant'] },
      { to: '/reddit/reportes', label: 'Reportes del día', icon: 'file', roles: ['admin', 'reddit_manager', 'reddit_assistant'] },
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

// Permisos adicionales (no son apartados del menú): se guardan en la misma tabla de permisos con la clave `ruta`.
export const PERMISO_IG_CONTRASENAS = 'permiso:ig_contrasenas'
export const PERMISO_IG_2FA = 'permiso:ig_2fa'
export const PERMISO_IG_HISTORIAL = 'permiso:ig_historial'
export const PERMISO_QUITAR_AVISOS = 'permiso:quitar_avisos_turno'
export const permisoSeccionIG = (id) => `permiso:ig_seccion_${id}`
// Acciones del apartado General de Cuentas de Instagram
export const PERMISO_IG_EDITAR = 'permiso:ig_general_editar'
export const PERMISO_IG_BAJA = 'permiso:ig_general_baja'
export const PERMISO_IG_BORRAR = 'permiso:ig_general_borrar'
export const PERMISO_IG_ORDENAR = 'permiso:ig_general_ordenar'
export const PERMISO_IG_EXPORTAR = 'permiso:ig_exportar'
// Quién ve cada dato de la tabla de Modelos (se decide en Equipo → Permisos)
export const permisoModelos = (k) => `permiso:modelos_${k}`
const ROLES_EQUIPO = ['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'reddit_manager', 'reddit_assistant', 'planner', 'masivos']
export const DATOS_MODELOS = [
  { k: 'comision', label: 'Comisión', roles: ROLES_EQUIPO },
  { k: 'notas', label: 'Notas', roles: ROLES_EQUIPO },
  { k: 'ficha', label: 'Ficha general', roles: ROLES_EQUIPO },
  { k: 'email', label: 'Email', roles: ['admin'] },
  { k: 'telefono', label: 'Teléfono / Whatsapp / Telegram', roles: ['admin'] },
  { k: 'privada', label: 'Información privada', roles: ['admin'] },
  { k: 'proceso', label: 'Proceso', roles: ['admin'] },
  { k: 'acceso', label: 'Estado del acceso (pendiente / con acceso / suspendido)', roles: ['admin'] },
]
export const PERMISOS_EXTRA = [
  {
    id: 'extra', label: 'Permisos adicionales',
    items: [{ to: PERMISO_IG_CONTRASENAS, label: 'Ver contraseñas en Cuentas de Instagram', roles: ['admin', 'ig_manager'] },
      { to: PERMISO_IG_2FA, label: 'Ver 2FA (código y QR) en Cuentas de Instagram', roles: ['admin', 'ig_manager', 'ig_assistant'] },
      { to: PERMISO_IG_HISTORIAL, label: 'Ver el historial y restaurar cambios en Cuentas de Instagram', roles: ['admin', 'ig_manager', 'ig_assistant'] },
    ],
  },
  {
    id: 'avisos_turno', label: 'Avisos de turno',
    items: [{ to: PERMISO_QUITAR_AVISOS, label: 'Quitar avisos de turno (reportes sin enviar y fichajes que faltan)', roles: ['admin'] }],
  },
  {
    id: 'modelos_info', label: 'Información de Modelos',
    items: DATOS_MODELOS.map((d) => ({ to: permisoModelos(d.k), label: `Ver «${d.label}» en Modelos`, roles: d.roles })),
  },
  {
    id: 'ig_apartados', label: 'Apartados de Cuentas de Instagram',
    items: [['stock_mails', 'Stock mails'], ['propias', 'Cuentas propias'], ['modelos', 'Cuentas de modelos'], ['stock_ig', 'Stock Instagram'], ['eliminadas', 'Eliminadas']]
      .map(([id, label]) => ({ to: permisoSeccionIG(id), label: `Acceder a «${label}»`, roles: ['admin', 'ig_manager'] })),
  },
]

// ───────────── Sub-permisos: pestañas y datos de cada apartado ─────────────
// Cada apartado puede tener «hijos»: pestañas internas y datos concretos. En Equipo → Permisos salen
// como un desplegable dentro de su apartado. Si no se toca nada, valen los permisos de siempre.
export const permisoTab = (ruta, id) => `permiso:tab:${ruta}:${id}`
const rolesDe = (ruta) => { for (const s of SECTIONS) for (const it of s.items) if (it.to === ruta) return it.roles; return ['admin'] }
const SOLO_MGR = ['admin', 'manager']
// Pestañas por apartado. `roles` solo si por defecto no las ven todos los que entran al apartado.
export const PESTANAS = {
  '/instagram': [
    { id: 'general', label: 'General' },
    { id: 'metricas', label: 'Métricas de perfil' },
    { id: 'cero', label: 'Cuentas de cero' },
  ],
  '/recaptaciones': [{ id: 'asignados', label: 'Fans asignados' }, { id: 'reparto', label: 'Repartir fans', roles: SOLO_MGR, soloRoles: SOLO_MGR }, { id: 'ranking', label: 'Ranking de fans', roles: SOLO_MGR, soloRoles: SOLO_MGR }, { id: 'desaparecidos', label: 'Fans desaparecidos', roles: SOLO_MGR, soloRoles: SOLO_MGR }],
  '/metricas-chatters': [{ id: 'chatter', label: 'Por chatter' }, { id: 'equipo', label: 'Equipo por semana' }, { id: 'informes', label: 'Informes de IA' }],
  '/lo-que-funciona': [{ id: 'registro', label: 'Registro de reels' }, { id: 'resumen', label: 'Resumen y Top 10' }, { id: 'auto', label: 'Automático (scrapper)' }],
  '/horarios': [{ id: 'sem', label: 'Semana' }, { id: 'grp', label: 'Grupos de modelos' }],
  '/masivos': [{ id: 'cal', label: 'Calendario' }, { id: 'fmt', label: 'Formatos' }],
  '/solicitudes': [{ id: 'tarjetas', label: 'Tarjetas' }, { id: 'modelo', label: 'Por modelo' }],
  '/fechas': [{ id: 'lista', label: 'Próximas' }, { id: 'calendario', label: 'Calendario' }],
  '/equipo': [{ id: 'extrabajadores', label: 'Extrabajadores' }],
}
export const rolesDefectoTab = (ruta, id) => {
  const t = (PESTANAS[ruta] || []).find((x) => x.id === id)
  return t?.roles || rolesDe(ruta)
}
// Hijos de cada apartado (lo que se despliega en la tabla de permisos). `tipo`: pestana | dato | accion
export const HIJOS = (() => {
  const h = {}
  Object.keys(PESTANAS).forEach((ruta) => { h[ruta] = PESTANAS[ruta].map((t) => ({ to: permisoTab(ruta, t.id), label: t.label, tipo: 'pestana', roles: t.roles || rolesDe(ruta), soloRoles: t.soloRoles })) })
  // Cuentas de Instagram: las pestañas con credenciales ya tenían su permiso propio (se conserva la clave)
  const ig = [['stock_mails', 'Stock mails'], ['propias', 'Cuentas propias'], ['modelos', 'Cuentas de modelos'], ['stock_ig', 'Stock Instagram'], ['eliminadas', 'Eliminadas']]
    .map(([id, label]) => ({ to: permisoSeccionIG(id), label, tipo: 'pestana', roles: ['admin', 'ig_manager'] }))
  const tabsIG = h['/instagram'] || []
  const tIG = (id) => tabsIG.find((t) => t.to === permisoTab('/instagram', id))
  h['/instagram'] = [tIG('general'), ...ig, tIG('metricas'), tIG('cero'),
    { to: PERMISO_IG_EDITAR, label: 'General: editar cuentas y cambiar estado o responsable desde la tabla', tipo: 'accion', roles: ['admin', 'ig_manager', 'ig_assistant'] },
    { to: PERMISO_IG_BAJA, label: 'General: dar de baja (pasar a Eliminadas)', tipo: 'accion', roles: ['admin', 'ig_manager'] },
    { to: PERMISO_IG_BORRAR, label: 'General: borrar una cuenta para siempre', tipo: 'accion', roles: ['admin', 'ig_manager'] },
    { to: PERMISO_IG_ORDENAR, label: 'General: reordenar las cuentas arrastrando', tipo: 'accion', roles: ['admin', 'ig_manager'] },
    { to: PERMISO_IG_EXPORTAR, label: 'Exportar las cuentas (todas las pestañas)', tipo: 'accion', roles: ['admin', 'ig_manager', 'ig_assistant'] },
    { to: PERMISO_IG_CONTRASENAS, label: 'Ver contraseñas', tipo: 'dato', roles: ['admin', 'ig_manager'] },
    { to: PERMISO_IG_2FA, label: 'Ver 2FA (código y QR)', tipo: 'dato', roles: ['admin', 'ig_manager', 'ig_assistant'] },
    { to: PERMISO_IG_HISTORIAL, label: 'Ver el historial y restaurar cambios', tipo: 'accion', roles: ['admin', 'ig_manager', 'ig_assistant'] }]
  h['/modelos'] = DATOS_MODELOS.map((d) => ({ to: permisoModelos(d.k), label: `Ver «${d.label}»`, tipo: 'dato', roles: d.roles }))
  h['/reportes-turno'] = [{ to: PERMISO_QUITAR_AVISOS, label: 'Quitar avisos de turno (reportes sin enviar y fichajes que faltan)', tipo: 'accion', roles: ['admin'] }]
  return h
})()

export const ROLES_EDITABLES = [
  { id: 'manager', label: 'Manager de Chatting' },
  { id: 'chatter', label: 'Chatter' },
  { id: 'ig_manager', label: 'Manager de Instagram' },
  { id: 'ig_assistant', label: 'Asistente IG' },
  { id: 'reddit_manager', label: 'Manager de Reddit' },
  { id: 'reddit_assistant', label: 'Asistente de Reddit' },
  { id: 'planner', label: 'Planner' },
  { id: 'masivos', label: 'Equipo de Masivos' },
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
