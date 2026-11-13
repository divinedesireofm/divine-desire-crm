// Orden de las pestañas a gusto de cada persona: se arrastran con el ratón y el orden se guarda en su usuario
// (tabla ordenes_usuario; si todavía no existe, se guarda en este navegador).
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

export function useOrdenPestanas(clave, lista) {
  const { session } = useAuth()
  const uid = session?.user?.id || 'anon'
  const lsKey = `orden-pestanas:${uid}:${clave}`
  const [guardado, setGuardado] = useState(null)
  const [sobre, setSobre] = useState(null)
  const arrastrando = useRef(null)

  useEffect(() => {
    let vivo = true
    try { const l = JSON.parse(localStorage.getItem(lsKey)); if (Array.isArray(l)) setGuardado(l) } catch { /* sin almacenamiento */ }
    if (uid !== 'anon') {
      supabase.from('ordenes_usuario').select('valor').eq('user_id', uid).eq('clave', clave).maybeSingle()
        .then(({ data }) => { if (vivo && Array.isArray(data?.valor)) setGuardado(data.valor) }, () => {})
    }
    return () => { vivo = false }
  }, [lsKey]) // eslint-disable-line

  const ids = lista.map(([id]) => id)
  const orden = [...(guardado || []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(guardado || []).includes(id))]
  const items = orden.map((id) => lista.find(([i]) => i === id))

  function guardar(nuevo) {
    setGuardado(nuevo)
    try { if (nuevo) localStorage.setItem(lsKey, JSON.stringify(nuevo)); else localStorage.removeItem(lsKey) } catch { /* sin almacenamiento */ }
    if (uid === 'anon') return
    if (nuevo) supabase.from('ordenes_usuario').upsert({ user_id: uid, clave, valor: nuevo, updated_at: new Date().toISOString() }, { onConflict: 'user_id,clave' }).then(() => {}, () => {})
    else supabase.from('ordenes_usuario').delete().eq('user_id', uid).eq('clave', clave).then(() => {}, () => {})
  }
  function mover(desde, hacia) {
    if (!desde || !hacia || desde === hacia) return
    const n = orden.filter((id) => id !== desde)
    n.splice(n.indexOf(hacia), 0, desde)
    guardar(n)
  }
  // Propiedades para el botón de cada pestaña (arrastrar y soltar)
  const dragProps = (id) => ({
    draggable: true,
    title: 'Arrastra para cambiar el orden de las pestañas',
    onDragStart: (e) => { arrastrando.current = id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) } catch { /* nada */ } },
    onDragOver: (e) => { if (arrastrando.current) { e.preventDefault(); if (sobre !== id) setSobre(id) } },
    onDragLeave: () => setSobre((s) => (s === id ? null : s)),
    onDrop: (e) => { e.preventDefault(); mover(arrastrando.current, id); arrastrando.current = null; setSobre(null) },
    onDragEnd: () => { arrastrando.current = null; setSobre(null) },
    'data-pestana': id,
  })
  const estilo = (id) => ({ cursor: 'grab', boxShadow: sobre === id && arrastrando.current !== id ? 'inset 3px 0 0 var(--accent)' : undefined })
  return { items, dragProps, estilo, personalizado: !!guardado, restablecer: () => guardar(null) }
}
