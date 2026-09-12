import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [roles, setRoles] = useState([]) // array de todos los roles de la persona
  const [loading, setLoading] = useState(true)
  const [deactivatedMsg, setDeactivatedMsg] = useState('')

  async function loadProfile(userId) {
    const [{ data, error }, { data: roleRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ])
    if (!error) {
      if (data.active === false) {
        setDeactivatedMsg('Tu cuenta ha sido desactivada. Contacta con tu administrador.')
        await supabase.auth.signOut()
        setProfile(null)
        setRoles([])
        return
      }
      setProfile(data)
      const rs = (roleRows || []).map((r) => r.role)
      setRoles(rs.length ? rs : [data.role]) // por si acaso user_roles aún no tiene fila
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setRoles([])
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  function hasRole(r) {
    return roles.includes(r)
  }
  function hasAnyRole(list) {
    return list.some((r) => roles.includes(r))
  }

  const value = {
    session,
    profile,
    roles,
    role: profile?.role ?? null, // rol principal, se mantiene por compatibilidad
    hasRole,
    hasAnyRole,
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
