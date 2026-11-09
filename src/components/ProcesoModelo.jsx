import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input } from './ui'

export const FASES_SUGERIDAS = ['Entrada a la agencia', 'Configuración de redes', 'Redes sociales']

const fmtHora = (ts) => (ts ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)) : '')
const taStyle = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }

// Agrupa los pasos por fase, en el orden en que aparecen
function agrupar(pasos) {
  const g = []
  pasos.forEach((p) => {
    let x = g.find((y) => y.fase === p.fase)
    if (!x) { x = { fase: p.fase, pasos: [] }; g.push(x) }
    x.pasos.push(p)
  })
  return g
}

// Formulario para crear o editar un paso
function FormPaso({ inicial, textoGuardar, onGuardar, onCancelar, fasesExistentes }) {
  const [fase, setFase] = useState(inicial?.fase || '')
  const [titulo, setTitulo] = useState(inicial?.titulo || '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion || '')
  const [busy, setBusy] = useState(false)
  const lista = useMemo(() => [...new Set([...fasesExistentes, ...FASES_SUGERIDAS])], [fasesExistentes])
  const listId = useMemo(() => 'fases-' + Math.random().toString(36).slice(2, 7), [])
  async function enviar(e) {
    e.preventDefault()
    if (!titulo.trim()) return
    setBusy(true)
    const ok = await onGuardar({ fase: fase.trim() || 'General', titulo: titulo.trim(), descripcion: descripcion.trim() })
    setBusy(false)
    if (ok !== false && !inicial) { setTitulo(''); setDescripcion('') }
  }
  return (
    <form onSubmit={enviar} className="p-3 rounded-md mb-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <div>
          <Input list={listId} placeholder="Fase (ej. Configuración de redes)" value={fase} onChange={(e) => setFase(e.target.value)} />
          <datalist id={listId}>{lista.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <Input className="sm:col-span-2" placeholder="Paso / tarea (ej. Crear la cuenta de Instagram)" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </div>
      <textarea rows={2} placeholder="Detalles o indicaciones (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm outline-none mb-2" style={taStyle} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !titulo.trim()}>{busy ? 'Guardando…' : textoGuardar}</Button>
        {onCancelar && <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>}
      </div>
    </form>
  )
}

// Lista de pasos agrupada por fase. `conCheck` = se pueden marcar como hechos (proceso de una modelo)
function ListaPasos({ pasos, conCheck, onToggle, onEditar, onBorrar, onMover }) {
  const [editando, setEditando] = useState(null)
  const fases = useMemo(() => [...new Set(pasos.map((p) => p.fase))], [pasos])
  const grupos = agrupar(pasos)
  if (!pasos.length) return <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>No hay pasos todavía.</p>
  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const hechos = g.pasos.filter((p) => p.hecho_at).length
        return (
          <div key={g.fase}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--accent)' }}>
              {g.fase}{conCheck && <span className="ml-2 normal-case font-normal" style={{ color: 'var(--text-muted)' }}>{hechos}/{g.pasos.length}</span>}
            </p>
            <div className="space-y-1.5">
              {g.pasos.map((p, i) => (
                editando === p.id ? (
                  <FormPaso key={p.id} inicial={p} textoGuardar="Guardar cambios" fasesExistentes={fases} onCancelar={() => setEditando(null)}
                    onGuardar={async (v) => { const ok = await onEditar(p, v); if (ok !== false) setEditando(null); return ok }} />
                ) : (
                  <div key={p.id} className="paso flex items-start gap-3 p-2.5 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', opacity: p.hecho_at ? 0.85 : 1 }}>
                    {conCheck && <input type="checkbox" className="mt-1" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} checked={!!p.hecho_at} onChange={() => onToggle(p)} aria-label={`Marcar «${p.titulo}» como hecho`} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ textDecoration: p.hecho_at ? 'line-through' : 'none', color: p.hecho_at ? 'var(--text-muted)' : 'var(--text)' }}>{p.titulo}</p>
                      {p.descripcion && <p className="text-xs whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.descripcion}</p>}
                      {conCheck && p.hecho_at && <p className="text-xs mt-0.5" style={{ color: 'var(--success)' }}>✅ Hecho el {fmtHora(p.hecho_at)}{p.quien ? ` · ${p.quien}` : ''}</p>}
                      {conCheck && p.plantilla_id && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>de la plantilla general</p>}
                    </div>
                    <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                      {onMover && <>
                        <button title="Subir" disabled={i === 0} onClick={() => onMover(p, -1)} className="disabled:opacity-30">▲</button>
                        <button title="Bajar" disabled={i === g.pasos.length - 1} onClick={() => onMover(p, 1)} className="disabled:opacity-30">▼</button>
                      </>}
                      <button className="underline" style={{ color: 'var(--accent)' }} onClick={() => setEditando(p.id)}>Editar</button>
                      <button className="underline" style={{ color: 'var(--danger)' }} onClick={() => onBorrar(p)}>Borrar</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Dentro de una tabla ancha, ajusta el panel al ancho visible y lo mantiene a la vista aunque se desplace la tabla en horizontal
function AnchoVisible({ children }) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(null)
  useEffect(() => {
    const cont = ref.current?.closest('.overflow-x-auto')
    if (!cont) return undefined
    const medir = () => setAncho(cont.clientWidth)
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir); ro.observe(cont)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} style={ancho ? { position: 'sticky', left: 0, width: ancho } : undefined}>{children}</div>
}

// Proceso de trabajo de UNA modelo
export default function ProcesoModelo({ modelo, onCambio }) {
  const { profile } = useAuth()
  const [pasos, setPasos] = useState([])
  const [nombres, setNombres] = useState({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [anadiendo, setAnadiendo] = useState(false)

  async function cargar() {
    const { data, error } = await supabase.from('model_procesos').select('*').eq('model_id', modelo.id).order('orden', { ascending: true }).order('created_at', { ascending: true })
    if (error) setMsg('No se pudo cargar el proceso. ¿Has ejecutado la migración 104?')
    setPasos(data || [])
    setLoading(false)
    onCambio?.(modelo.id, data || [])
  }
  useEffect(() => { cargar() }, [modelo.id])
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').then(({ data }) => setNombres(Object.fromEntries((data || []).map((p) => [p.id, p.full_name]))))
  }, [])

  const conNombre = pasos.map((p) => ({ ...p, quien: p.hecho_por ? nombres[p.hecho_por] : '' }))
  const hechos = pasos.filter((p) => p.hecho_at).length
  const fasesExistentes = [...new Set(pasos.map((p) => p.fase))]
  const aviso = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3500) }

  async function toggle(p) {
    const cambios = p.hecho_at ? { hecho_at: null, hecho_por: null } : { hecho_at: new Date().toISOString(), hecho_por: profile?.id || null }
    const { error } = await supabase.from('model_procesos').update(cambios).eq('id', p.id)
    if (error) { aviso('No se pudo guardar el cambio.'); return }
    cargar()
  }
  async function anadir(v) {
    const orden = pasos.reduce((m, x) => Math.max(m, x.orden || 0), 0) + 1
    const { error } = await supabase.from('model_procesos').insert([{ model_id: modelo.id, ...v, orden }])
    if (error) { aviso('No se pudo añadir el paso.'); return false }
    cargar(); return true
  }
  async function editar(p, v) {
    const { error } = await supabase.from('model_procesos').update(v).eq('id', p.id)
    if (error) { aviso('No se pudo guardar.'); return false }
    cargar(); return true
  }
  async function borrar(p) {
    if (!confirm(`¿Borrar el paso «${p.titulo}» de ${modelo.stage_name}?${p.hecho_at ? '\n\nEstaba marcado como hecho; se perderá ese registro.' : ''}`)) return
    const { error } = await supabase.from('model_procesos').delete().eq('id', p.id)
    if (error) { aviso('No se pudo borrar.'); return }
    cargar()
  }
  async function mover(p, dir) {
    // intercambia con el vecino de la misma fase; antes se renumera todo para evitar empates
    const orden = pasos.map((x, i) => ({ id: x.id, fase: x.fase, orden: i + 1 }))
    const misma = orden.filter((x) => x.fase === p.fase)
    const i = misma.findIndex((x) => x.id === p.id)
    const vecino = misma[i + dir]
    if (!vecino) return
    const a = orden.find((x) => x.id === p.id); const b = orden.find((x) => x.id === vecino.id)
    const tmp = a.orden; a.orden = b.orden; b.orden = tmp
    const res = await Promise.all(orden.map((x) => supabase.from('model_procesos').update({ orden: x.orden }).eq('id', x.id)))
    if (res.some((r) => r.error)) aviso('No se pudo reordenar.')
    cargar()
  }
  async function cargarPlantilla() {
    const { data, error } = await supabase.rpc('proceso_cargar_plantilla', { p_model: modelo.id })
    if (error) { aviso('No se pudo cargar la plantilla.'); return }
    aviso(data ? `Se añadieron ${data} pasos de la plantilla.` : 'Ya tiene todos los pasos de la plantilla.')
    cargar()
  }
  async function empezarDeCero() {
    if (!confirm(`¿Borrar TODO el proceso de ${modelo.stage_name} (${pasos.length} pasos, ${hechos} hechos) y empezar de 0?\n\nNo se puede deshacer. Después podrás cargar la plantilla general o crear pasos nuevos.`)) return
    const { error } = await supabase.from('model_procesos').delete().eq('model_id', modelo.id)
    if (error) { aviso('No se pudo borrar el proceso.'); return }
    cargar()
  }

  return (
    <AnchoVisible>
    <div className="p-5" style={{ background: 'var(--panel)', borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <p className="font-medium">Proceso de trabajo · {modelo.stage_name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pasos.length ? `${hechos} de ${pasos.length} pasos hechos` : 'Sin pasos'} · al marcar un paso se guarda la fecha y la hora</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => setAnadiendo((v) => !v)}>{anadiendo ? 'Cerrar' : '+ Añadir paso a esta modelo'}</Button>
          <Button variant="ghost" onClick={cargarPlantilla}>⤓ Cargar pasos de la plantilla</Button>
          <Button variant="danger" onClick={empezarDeCero} disabled={!pasos.length}>🗑 Borrar todo y empezar de 0</Button>
        </div>
      </div>
      {pasos.length > 0 && (
        <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--panel-alt)' }}>
          <div style={{ width: `${(hechos / pasos.length) * 100}%`, height: '100%', background: 'var(--success)', transition: 'width .3s' }} />
        </div>
      )}
      {anadiendo && <FormPaso textoGuardar="Añadir paso" fasesExistentes={fasesExistentes} onGuardar={anadir} onCancelar={() => setAnadiendo(false)} />}
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{msg}</p>}
      {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        : <ListaPasos pasos={conNombre} conCheck onToggle={toggle} onEditar={editar} onBorrar={borrar} onMover={mover} />}
    </div>
    </AnchoVisible>
  )
}

// Plantilla: pasos que se vuelcan en TODAS las modelos
export function PlantillaProcesos({ onCerrar, onCambio }) {
  const [pasos, setPasos] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const aviso = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  async function cargar() {
    const { data, error } = await supabase.from('proceso_plantilla').select('*').order('orden', { ascending: true }).order('created_at', { ascending: true })
    if (error) aviso('No se pudo cargar la plantilla. ¿Has ejecutado la migración 104?')
    setPasos(data || []); setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  async function anadir(v) {
    const { error } = await supabase.rpc('proceso_anadir_global', { p_fase: v.fase, p_titulo: v.titulo, p_descripcion: v.descripcion })
    if (error) { aviso('No se pudo añadir: ' + error.message); return false }
    aviso('Paso añadido a la plantilla y a todas las modelos ✓'); cargar(); onCambio?.(); return true
  }
  async function editar(p, v) {
    const { error } = await supabase.rpc('proceso_editar_global', { p_id: p.id, p_fase: v.fase, p_titulo: v.titulo, p_descripcion: v.descripcion })
    if (error) { aviso('No se pudo guardar: ' + error.message); return false }
    aviso('Cambio aplicado en todas las modelos ✓'); cargar(); onCambio?.(); return true
  }
  async function borrar(p) {
    if (!confirm(`¿Borrar «${p.titulo}» de la plantilla Y de todas las modelos?\n\nSe perderá también si alguna lo tenía marcado como hecho. No se puede deshacer.`)) return
    const { error } = await supabase.from('proceso_plantilla').delete().eq('id', p.id)
    if (error) { aviso('No se pudo borrar.'); return }
    aviso('Paso borrado de todas las modelos ✓'); cargar(); onCambio?.()
  }

  return (
    <Panel className="p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">🧩 Pasos para TODAS las modelos</p>
        <button onClick={onCerrar} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>Cerrar</button>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Lo que añadas, edites o borres aquí se aplica a todas las modelos (y a las que crees en el futuro). Marcar un paso como hecho es siempre individual, en el proceso de cada modelo.</p>
      <FormPaso textoGuardar="Añadir a todas las modelos" fasesExistentes={[...new Set(pasos.map((p) => p.fase))]} onGuardar={anadir} />
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{msg}</p>}
      {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p> : <ListaPasos pasos={pasos} onEditar={editar} onBorrar={borrar} />}
    </Panel>
  )
}
