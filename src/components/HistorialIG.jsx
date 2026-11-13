import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { SECCIONES } from '../lib/cuentasIGSecciones'
import { Button } from './ui'

// Botón «Deshacer» + historial de Cuentas de Instagram. Cada acción (con lo que se sincroniza solo en otros apartados) es un grupo que se restaura entero.
const TABLAS = {
  instagram_accounts: 'General', ig_cuentas_propias: 'Cuentas propias', ig_cuentas_modelos: 'Cuentas de modelos',
  ig_stock_instagram: 'Stock Instagram', ig_stock_mails: 'Stock mails', ig_eliminadas: 'Eliminadas',
}
const RUIDO = ['orden', 'updated_at', 'followers_count', 'warmup_checklist', 'created_at']
const SECRETOS = ['contrasena', 'contrasena_email', 'contrasena_ig', 'dos_fa', 'two_fa_code']
const GENERAL = { username: 'Usuario', status: 'Estado', model_id: 'Modelo', email: 'Email', two_fa_code: '2FA', assigned_at: 'Fecha', profile_link: 'Enlace', observations: 'Observaciones', restrictions: 'Restricciones', original_username: 'Original', target_audience: 'Público', bio_link: 'Link bio', assigned_to: 'Responsable', archivada: 'Archivada' }

function etiquetaCampo(tabla, k) {
  if (tabla === 'instagram_accounts') return GENERAL[k] || k
  const sec = Object.values(SECCIONES).find((s) => s.tabla === tabla)
  return sec?.cols.find((c) => c.k === k)?.n || k
}
const nombreFila = (f) => (f ? (f.usuario || f.username || f.instagram_nuevo || f.instagram_actual || f.instagram_original || f.correo || '') : '')
const ver = (v) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v))

function cambiosDe(e) {
  if (e.accion !== 'update') return []
  const keys = Array.from(new Set([...Object.keys(e.antes || {}), ...Object.keys(e.despues || {})])).filter((k) => !RUIDO.includes(k) && k !== 'id')
  return keys.filter((k) => JSON.stringify(e.antes?.[k]) !== JSON.stringify(e.despues?.[k])).map((k) => {
    const n = etiquetaCampo(e.tabla, k)
    return SECRETOS.includes(k) ? `${n} (cambiado)` : `${n}: ${ver(e.antes?.[k])} → ${ver(e.despues?.[k])}`
  })
}

// Un grupo = lo que se hizo de una vez. El primer registro es la acción de la persona; el resto, lo sincronizado.
function agrupar(filas) {
  const m = new Map()
  filas.forEach((e) => { if (!m.has(e.grupo)) m.set(e.grupo, []); m.get(e.grupo).push(e) })
  return Array.from(m.values()).map((es) => {
    const orden = es.slice().sort((a, b) => a.id - b.id)
    const p = orden[0]
    const f = p.despues || p.antes
    const verbo = p.es_deshacer ? 'Restauración' : p.accion === 'insert' ? 'Añadido' : p.accion === 'delete' ? 'Borrado' : 'Modificado'
    const nombre = nombreFila(f)
    return {
      grupo: p.grupo, id: orden[orden.length - 1].id, usuario: p.usuario, creado: p.created_at, esDeshacer: p.es_deshacer, deshecho: orden.some((x) => x.deshecho),
      titulo: `${verbo} en ${TABLAS[p.tabla] || p.tabla}${nombre ? ` · ${nombre}` : ''}`,
      detalle: cambiosDe(p), extra: orden.length - 1, borraGeneral: orden.some((x) => x.accion === 'delete' && x.tabla === 'instagram_accounts'),
    }
  }).sort((a, b) => b.id - a.id)
}

const hora = (iso) => { const d = new Date(iso); return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

export default function HistorialIG({ onRestaurado }) {
  const { profile } = useAuth()
  const [grupos, setGrupos] = useState([])
  const [nombres, setNombres] = useState({})
  const [abierto, setAbierto] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const nombresRef = useRef({})

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('ig_historial').select('id, grupo, tabla, fila_id, accion, antes, despues, usuario, es_deshacer, deshecho, created_at').order('id', { ascending: false }).limit(300)
    if (err) { setError(err.message.includes('ig_historial') ? 'Falta ejecutar la migración 115 en Supabase.' : err.message); return }
    setError(null)
    setGrupos(agrupar(data || []))
    const faltan = Array.from(new Set((data || []).map((x) => x.usuario).filter((u) => u && !nombresRef.current[u])))
    if (faltan.length) {
      const { data: pr } = await supabase.from('profiles').select('id, full_name').in('id', faltan)
      ;(pr || []).forEach((p) => { nombresRef.current[p.id] = p.full_name })
      setNombres({ ...nombresRef.current })
    }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (!document.hidden) cargar() }, 4000)
    return () => clearInterval(t)
  }, [cargar])

  const ultimo = grupos.find((g) => g.usuario === profile?.id && !g.esDeshacer && !g.deshecho)

  async function restaurar(g, forzar = false) {
    setTrabajando(true); setAviso(null)
    const { data, error: err } = await supabase.rpc('ig_deshacer', { p_grupo: g.grupo, p_forzar: forzar })
    setTrabajando(false)
    if (err) { setAviso({ tipo: 'error', texto: 'No se pudo restaurar: ' + err.message }); return }
    if (data?.conflicto && !forzar) {
      const ok = window.confirm('Ese registro se ha modificado después de este cambio (por ti o por otra persona).\n\nSi lo restauras, se perderán esas modificaciones posteriores.\n\n¿Restaurar igualmente?')
      if (ok) return restaurar(g, true)
      return
    }
    if (!data?.ok) { setAviso({ tipo: 'error', texto: data?.error || 'No se pudo restaurar.' }); return }
    setAviso({ tipo: 'ok', texto: `Restaurado: ${g.titulo}`, rehacer: data.grupo, titulo: g.titulo, borraGeneral: g.borraGeneral })
    await cargar()
    onRestaurado && onRestaurado()
  }
  async function rehacer() {
    const a = aviso; if (!a?.rehacer) return
    await restaurar({ grupo: a.rehacer, titulo: `Rehacer: ${a.titulo}` })
  }

  const btn = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2" data-historial-ig>
      <button type="button" disabled={!ultimo || trabajando} onClick={() => ultimo && restaurar(ultimo)} className="px-3 py-1.5 rounded-full text-sm disabled:opacity-40" style={btn}
        title={ultimo ? `Deshacer: ${ultimo.titulo}` : 'No hay ningún cambio tuyo reciente que deshacer'}>
        ↩ Deshacer{ultimo ? <span className="hidden md:inline" style={{ color: 'var(--text-muted)' }}> · {ultimo.titulo.length > 44 ? ultimo.titulo.slice(0, 44) + '…' : ultimo.titulo}</span> : null}
      </button>
      <button type="button" onClick={() => { setAbierto(true); cargar() }} className="px-3 py-1.5 rounded-full text-sm" style={btn}>🕘 Historial</button>

      {aviso && (
        <div className="basis-full text-sm px-3 py-2 rounded-md flex flex-wrap items-center gap-3" data-aviso-historial style={{ background: 'var(--panel-alt)', border: `1px solid ${aviso.tipo === 'ok' ? 'var(--success)' : 'var(--danger)'}`, color: aviso.tipo === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
          <span>{aviso.tipo === 'ok' ? '✓ ' : ''}{aviso.texto}</span>
          {aviso.tipo === 'ok' && aviso.borraGeneral && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ojo: de una cuenta del General borrada se recupera la ficha, pero no sus planificaciones ni métricas.</span>}
          {aviso.tipo === 'ok' && aviso.rehacer && <button type="button" className="underline" onClick={rehacer}>Rehacer</button>}
          <button type="button" className="underline ml-auto" style={{ color: 'var(--text-muted)' }} onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.6)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="w-full max-w-2xl rounded-xl flex flex-col" style={{ background: 'var(--panel)', border: '1px solid var(--border)', maxHeight: '85vh' }} role="dialog" aria-label="Historial de cambios">
            <div className="p-5 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Historial de cambios</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Se guardan 30 días. Restaurar devuelve esa acción entera (y lo que se sincronizó con ella). Las contraseñas y el 2FA no se muestran, pero sí se restauran.</p>
              </div>
              <Button variant="ghost" onClick={() => setAbierto(false)}>Cerrar</Button>
            </div>
            {error && <p className="px-5 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="overflow-y-auto px-5 pb-5 flex flex-col gap-2">
              {grupos.length === 0 && !error && <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay cambios registrados.</p>}
              {grupos.slice(0, 60).map((g) => (
                <div key={g.grupo} data-grupo-historial className="rounded-md p-3 flex items-start justify-between gap-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', opacity: g.deshecho ? 0.6 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="text-sm font-medium" style={{ wordBreak: 'break-word' }}>{g.titulo}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hora(g.creado)} · {nombres[g.usuario] || 'Sistema'}{g.extra > 0 ? ` · +${g.extra} sincronizado${g.extra > 1 ? 's' : ''} en otros apartados` : ''}</p>
                    {g.detalle.length > 0 && <ul className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{g.detalle.slice(0, 6).map((d) => <li key={d} style={{ wordBreak: 'break-word' }}>• {d}</li>)}{g.detalle.length > 6 ? <li>• … y {g.detalle.length - 6} más</li> : null}</ul>}
                  </div>
                  {g.deshecho
                    ? <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Restaurado</span>
                    : <Button variant="ghost" disabled={trabajando} onClick={() => restaurar(g)}>Restaurar</Button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
