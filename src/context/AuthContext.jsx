import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Caché de la última sesión (perfil, roles y permisos): la app abre al instante y se refresca por detrás
const CLAVE_CACHE = 'dd-auth-cache'
const leerCache = (uid) => { try { const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null'); return c && c.uid === uid ? c : null } catch (_e) { return null } }
const guardarCache = (o) => { try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(o)) } catch (_e) { /* sin caché */ } }
const borrarCache = () => { try { localStorage.removeItem(CLAVE_CACHE) } catch (_e) { /* sin caché */ } }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [roles, setRoles] = useState([]) // array de todos los roles de la persona
  const [perms, setPerms] = useState({}) // { 'chatter|/pagos': true/false } — cambios del admin sobre los valores por defecto
  const [loading, setLoading] = useState(true)
  const [deactivatedMsg, setDeactivatedMsg] = useState('')

  const cargadoPara = useRef(null) // id de la persona cuyo perfil, roles y permisos ya están cargados

  async function fetchPerms() {
    const { data } = await supabase.from('role_permissions').select('role, ruta, permitido')
    const m = {}
    ;(data || []).forEach((p) => { m[p.role + '|' + p.ruta] = p.permitido })
    return m
  }
  async function loadPerms() {
    const m = await fetchPerms()
    setPerms(m)
    try { const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null'); if (c) guardarCache({ ...c, perms: m }) } catch (_e) { /* sin caché */ }
  }

  // Perfil, roles y permisos se piden a la vez (antes iban en tandas y la pantalla enseñaba «sin permisos» mientras llegaban)
  async function loadProfile(userId) {
    const [{ data, error }, { data: roleRows }, permsNuevos] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
      fetchPerms().catch(() => null),
    ])
    if (permsNuevos) setPerms(permsNuevos)
    if (!error) {
      if (data.active === false || data.extrabajador === true) {
        setDeactivatedMsg('Tu cuenta ha sido desactivada. Contacta con tu administrador.')
        borrarCache(); cargadoPara.current = null
        await supabase.auth.signOut()
        setProfile(null)
        setRoles([])
        return
      }
      setProfile(data)
      const rs = (roleRows || []).map((r) => r.role)
      const rolesFinal = rs.length ? rs : [data.role] // por si acaso user_roles aún no tiene fila
      setRoles(rolesFinal)
      cargadoPara.current = userId
      guardarCache({ uid: userId, profile: data, roles: rolesFinal, perms: permsNuevos || {} })
      // Primera vez que entra (ya con contraseña): deja de verse como «pendiente» en Equipo
      if ('primer_acceso' in data && !data.primer_acceso && data.password_set !== false) supabase.rpc('marcar_primer_acceso').then(() => {}, () => {})
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        const c = leerCache(session.user.id)
        if (c) {
          // Abre ya con lo guardado de la última vez y lo refresca por detrás
          setProfile(c.profile); setRoles(c.roles); setPerms(c.perms || {}); cargadoPara.current = session.user.id
          setLoading(false)
          loadProfile(session.user.id)
          return
        }
        await loadProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === 'INITIAL_SESSION') return // ya lo gestiona getSession
      setSession(session)
      if (session?.user) {
        // Renovar el token o volver a la pestaña no recarga nada: solo un inicio de sesión nuevo
        if (cargadoPara.current === session.user.id) return
        setLoading(true)
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        cargadoPara.current = null
        borrarCache()
        setProfile(null)
        setRoles([])
        setPerms({})
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Si un admin da de baja o desactiva a alguien mientras está dentro, se le echa en menos de un minuto
  useEffect(() => {
    if (!profile?.id) return undefined
    async function comprobar() {
      const { data, error } = await supabase.from('profiles').select('active, extrabajador').eq('id', profile.id).single()
      if (error && (error.code === 'PGRST116' || error.status === 401 || error.status === 403)) { await supabase.auth.signOut(); return }
      if (data && (data.active === false || data.extrabajador === true)) {
        setDeactivatedMsg('Tu cuenta ha sido desactivada. Contacta con tu administrador.')
        await supabase.auth.signOut()
      }
    }
    const t = setInterval(comprobar, 45000)
    window.addEventListener('focus', comprobar)
    return () => { clearInterval(t); window.removeEventListener('focus', comprobar) }
  }, [profile?.id])

  function hasRole(r) {
    return roles.includes(r)
  }
  function hasAnyRole(list) {
    return list.some((r) => roles.includes(r))
  }

  // ¿Puede esta persona entrar a este apartado? El admin entra siempre. Para el resto,
  // vale si alguno de sus roles lo permite (el cambio del admin manda sobre el valor por defecto).
  function puedeVer(ruta, rolesPorDefecto) {
    if (roles.includes('admin') || ruta === '/') return true
    return roles.some((r) => {
      const k = r + '|' + ruta
      return k in perms ? perms[k] : rolesPorDefecto.includes(r)
    })
  }

  const value = {
    session,
    profile,
    roles,
    role: profile?.role ?? null, // rol principal, se mantiene por compatibilidad
    hasRole,
    hasAnyRole,
    puedeVer,
    perms,
    refreshPermissions: loadPerms,
    loading,
    deactivatedMsg,
    signOut: () => supabase.auth.signOut(),
    refreshProfile: () => (session?.user ? loadProfile(session.user.id) : null),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
