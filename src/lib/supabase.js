import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
    'Revisa el archivo .env (local) o la configuración de variables en Netlify (producción).'
  )
}

// Si "Recordarme" está marcado (por defecto), la sesión se guarda en localStorage
// y sobrevive a cerrar el navegador. Si se desmarca, se guarda solo en sessionStorage
// y desaparece al cerrar la pestaña — pensado para ordenadores compartidos.
const remindStorage = {
  getItem: (key) => {
    const useLocal = localStorage.getItem('dd-remember') !== 'false'
    return (useLocal ? localStorage : sessionStorage).getItem(key)
  },
  setItem: (key, value) => {
    const useLocal = localStorage.getItem('dd-remember') !== 'false'
    ;(useLocal ? localStorage : sessionStorage).setItem(key, value)
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storage: remindStorage },
})
