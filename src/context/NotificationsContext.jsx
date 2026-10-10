import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { reproducirAviso, instalarDesbloqueo } from '../lib/sonido'
import { avisosDeFechas, iso } from '../lib/fechasEventos'

const DIAS_ALERTA_CONTENIDO = 14
const Ctx = createContext(null)

// Reúne en una sola lista:
//  - los avisos guardados en la base de datos (reportes, sanciones, nuevos compañeros, entradas/salidas)
//  - los avisos calculados al vuelo para quien gestiona (contenido atrasado, contraseña sin crear)
//  - los avisos de fechas importantes para TODO el mundo, también modelos (1 semana, 2 días, 1 día y el mismo día)
// Cada aviso tiene una clave; al marcarlo como leído se guarda esa clave y desaparece para esa persona.
export function NotificationsProvider({ children }) {
  const { profile, hasAnyRole } = useAuth()
  const activo = !!profile && hasAnyRole(['admin', 'manager', 'chatter', 'ig_manager', 'ig_assistant', 'modelo'])
  const gestiona = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const esModelo = hasAnyRole(['modelo'])
  const [items, setItems] = useState([])
  const [leidas, setLeidas] = useState(() => new Set())
  const [cargado, setCargado] = useState(false)
  const leidasRef = useRef(leidas)
  const vistosRef = useRef(null) // claves ya conocidas; null hasta la primera carga
  leidasRef.current = leidas
  const fechasRef = useRef({ t: 0, rows: [], paises: ['es', 've'], custom: [] }) // datos de fechas, se refrescan cada 10 min

  async function datosFechas() {
    const f = fechasRef.current
    if (Date.now() - f.t < 600000) return f
    f.t = Date.now() // aunque falle, no se reintenta en cada refresco
    const [r1, r2, r3] = await Promise.all([
      supabase.rpc('fechas_visibles'),
      supabase.from('paises_fechas').select('id, nombre, color'),
      supabase.from('fechas_config').select('valor').eq('clave', 'paises').maybeSingle(),
    ])
    f.rows = r1.data || []
    f.custom = r2.data || []
    f.paises = Array.isArray(r3.data?.valor) ? r3.data.valor : ['es', 've']
    return f
  }

  const cargar = useCallback(async () => {
    if (!profile) return
    const hace14d = new Date(Date.now() - 14 * 86400000).toISOString()
    const hace14dias = new Date(Date.now() - DIAS_ALERTA_CONTENIDO * 86400000).toISOString().slice(0, 10)

    const consultas = [
      supabase.from('notifications').select('id, tipo, prioridad, texto, ruta, created_at').gte('created_at', hace14d).order('created_at', { ascending: false }).limit(150),
      supabase.from('notification_reads').select('clave').eq('user_id', profile.id).limit(2000),
    ]
    if (gestiona) {
      consultas.push(
        supabase.from('content_assignments').select('id, titulo, models(stage_name)').lte('enviado_en', hace14dias).is('hecho_en', null).not('enviado_en', 'is', null),
        supabase.from('profiles').select('id, full_name').eq('password_set', false).lt('created_at', new Date(Date.now() - 86400000).toISOString()), // solo si lleva más de 1 día sin crearla
      )
    }
    const [{ data: notifs }, { data: reads }, r3, r4] = await Promise.all(consultas)

    const lista = (notifs || []).map((n) => ({ key: 'n:' + n.id, tipo: n.tipo, prioridad: n.prioridad, texto: n.texto, ruta: n.ruta, fecha: n.created_at }))
    ;((r3 && r3.data) || []).forEach((c) => lista.push({ key: 'cont:' + c.id, tipo: 'contenido', prioridad: 'alta', texto: `${c.models?.stage_name}: "${c.titulo}" lleva más de 14 días sin entregarse`, ruta: '/contenido', fecha: null }))
    ;((r4 && r4.data) || []).forEach((p) => lista.push({ key: 'pwd:' + p.id, tipo: 'pendiente', prioridad: 'alta', texto: `${p.full_name} todavía no ha creado su contraseña`, ruta: '/equipo', fecha: null }))

    // Planificaciones de reels enviadas a la modelo en los últimos 7 días
    if (esModelo) {
      try {
        const { data: planes } = await supabase.rpc('mis_planificaciones')
        const desde = Date.now() - 7 * 86400000
        ;(planes || []).filter((x) => x.enviado_at && new Date(x.enviado_at).getTime() > desde).forEach((x) => lista.push({
          key: 'plan:' + x.id + ':' + x.enviado_at, tipo: 'planificacion', prioridad: 'alta',
          texto: `Tienes una planificación de reels nueva para @${String(x.usuario || '').replace(/^@/, '')}`, ruta: '/reels', fecha: x.enviado_at,
        }))
      } catch { /* sin planificaciones */ }
    }

    try {
      const f = await datosFechas()
      avisosDeFechas({ rows: f.rows, paises: f.paises, custom: f.custom, hoy: iso(new Date()) }).forEach((a) => lista.push(a))
    } catch { /* si fallan las fechas, el resto de avisos sigue funcionando */ }

    setItems(lista)
    setLeidas(new Set((reads || []).map((r) => r.clave)))
    setCargado(true)
  }, [profile, gestiona, esModelo])

  useEffect(() => {
    if (!activo) return
    cargar()
    const poll = setInterval(cargar, 30000)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', alVolver) }
  }, [activo, cargar])

  // Tiempo real: cuando la base de datos guarda un aviso nuevo que esta persona puede ver, llega al instante.
  // (La base de datos solo envía los avisos que le corresponden por rol.) Si el canal falla,
  // el refresco cada 30 s y al volver a la pestaña sigue funcionando como respaldo.
  useEffect(() => {
    if (!activo || !profile) return
    let temporizador = null
    const canal = supabase
      .channel('avisos-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        clearTimeout(temporizador)
        temporizador = setTimeout(cargar, 300)
      })
      .subscribe()
    return () => { clearTimeout(temporizador); supabase.removeChannel(canal) }
  }, [activo, profile, cargar])

  const marcarLeidas = useCallback(async (claves) => {
    if (!claves.length || !profile) return
    setLeidas((s) => { const n = new Set(s); claves.forEach((c) => n.add(c)); return n })
    const { error } = await supabase.from('notification_reads').upsert(claves.map((clave) => ({ user_id: profile.id, clave })), { onConflict: 'user_id,clave' })
    if (error) cargar() // si falla, vuelve al estado real
  }, [profile, cargar])

  const noLeidas = useMemo(() => items.filter((i) => !leidas.has(i.key)), [items, leidas])
  const importantes = useMemo(() => noLeidas.filter((i) => i.prioridad !== 'baja'), [noLeidas])
  const secundarias = useMemo(() => noLeidas.filter((i) => i.prioridad === 'baja'), [noLeidas])

  // Sonido: solo cuando aparece un aviso nuevo sin leer después de la primera carga
  useEffect(() => { if (!activo) return undefined; return instalarDesbloqueo() }, [activo])
  useEffect(() => {
    if (!cargado) return
    if (vistosRef.current === null) { vistosRef.current = new Set(items.map((i) => i.key)); return }
    const nuevos = noLeidas.filter((i) => !vistosRef.current.has(i.key))
    items.forEach((i) => vistosRef.current.add(i.key))
    if (nuevos.length) reproducirAviso(nuevos.some((i) => i.prioridad !== 'baja') ? 'importante' : 'secundaria')
  }, [items, cargado])

  const value = { activo, cargado, importantes, secundarias, marcarLeidas, recargar: cargar }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotifications() {
  return useContext(Ctx)
}
