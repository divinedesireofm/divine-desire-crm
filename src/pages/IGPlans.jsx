import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { Link } from 'react-router-dom'
import CopyButton from '../components/CopyButton'

const ORIGENES = [{ id: 'nuevo', n: 'Nuevo' }, { id: 'ganador', n: 'Ganador' }]
const TIPOS = [{ id: 'sugerente', n: 'Sugerente' }, { id: 'marca_personal', n: 'Marca personal' }]
const nOrigen = (id) => ORIGENES.find((o) => o.id === id)?.n || id
const nTipo = (id) => TIPOS.find((t) => t.id === id)?.n || id

const reelVacio = (i = 0) => ({ origen: 'nuevo', tipo: i % 2 === 0 ? 'sugerente' : 'marca_personal', link: '', gancho: '', texto: '', tematica: '', prueba: false })
const estructura = (dias, porDia) => Array.from({ length: dias }, () => ({ reels: Array.from({ length: porDia }, (_, i) => reelVacio(i)) }))
const VACIA = { id: null, account_id: '', titulo: '', reglas: '', mostrar_resumen: true, estado: 'guardada', responsable_id: '', created_at: null, dias: estructura(7, 2) }

const sinArroba = (u) => String(u || '').replace(/^@/, '')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const fmtTS = (ts) => (ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')
// Fecha exacta de creación: «10/10/2026 23:53»
const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const aIso = (t) => { const m = String(t || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '' }
const deIso = (i) => { const m = String(i || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
const tituloHoy = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ESTADOS = { borrador: ['Borrador', 'var(--gold)'], guardada: ['Guardada', 'var(--text-muted)'] }

// ---- Texto listo para copiar y pegar a la chica ----
function bloqueReel(r) {
  const l = [`${nOrigen(r.origen).toUpperCase()} ${nTipo(r.tipo).toUpperCase()}`]
  if (r.prueba) l.push('🧪 REEL DE PRUEBA')
  if (r.tematica?.trim()) l.push(`🎯 Temática: ${r.tematica.trim()}`)
  if (r.link?.trim()) l.push(`🔗 ${r.link.trim()}`)
  if (r.gancho?.trim()) l.push(`🎣 ${r.gancho.trim()}`)
  if (r.texto?.trim()) l.push(`📝 ${r.texto.trim()}`)
  return l.join('\n')
}
export function textoDia(d, i) {
  return [`DIA ${i + 1}:`, ...(d.reels || []).map(bloqueReel).map((b, j) => (j === 0 ? b : '\n' + b))].join('\n')
}
export function textoPlan(p, usuario) {
  const todos = (p.dias || []).flatMap((d) => d.reels || [])
  const partes = [`REELS ${sinArroba(usuario)} ${String(p.titulo || tituloHoy()).toUpperCase()}`.trim()]
  if (p.mostrar_resumen) {
    // Una línea por cada combinación que realmente haya en la planificación (origen + tipo)
    const cuenta = (o, t) => todos.filter((r) => r.origen === o && r.tipo === t).length
    const resumen = []
    const nS = cuenta('nuevo', 'sugerente'), nM = cuenta('nuevo', 'marca_personal')
    const gS = cuenta('ganador', 'sugerente'), gM = cuenta('ganador', 'marca_personal')
    if (nS) resumen.push(plural(nS, 'reel nuevo sugerente', 'reels nuevos sugerentes'))
    if (nM) resumen.push(plural(nM, 'reel nuevo marca personal', 'reels nuevos marca personal'))
    if (gS) resumen.push(plural(gS, 'reel ganador sugerente adaptado', 'reels ganadores sugerentes adaptados'))
    if (gM) resumen.push(plural(gM, 'reel ganador marca personal adaptado', 'reels ganadores marca personal adaptados'))
    const pr = todos.filter((r) => r.prueba).length
    if (pr) resumen.push(plural(pr, 'reel de prueba', 'reels de prueba'))
    if (resumen.length) partes.push('\n' + resumen.join('\n'))
  }
  if (p.reglas?.trim()) partes.push('\n' + p.reglas.trim())
  ;(p.dias || []).forEach((d, i) => partes.push('\n' + textoDia(d, i)))
  return partes.join('\n') + '\n'
}

export default function IGPlans() {
  const { hasAnyRole, profile } = useAuth()
  const puedeBorrar = hasAnyRole(['admin', 'ig_manager'])
  const [cuentas, setCuentas] = useState([])
  const [planes, setPlanes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [ed, setEd] = useState(null) // planificación en edición
  const [nDias, setNDias] = useState(7)
  const [nPorDia, setNPorDia] = useState(2)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState('planes') // planes | borradores
  const [equipo, setEquipo] = useState([])
  const [todosNombres, setTodosNombres] = useState({})
  const [toast, setToast] = useState('')

  async function cargar(silencioso = false) {
    if (!silencioso) setLoading(true)
    const [{ data: c }, { data: p }, eq] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username, model_id, models(stage_name)').order('username'),
      supabase.from('ig_plans').select('*').order('created_at', { ascending: false }).limit(300),
      getProfilesByRoles(['admin', 'ig_manager', 'ig_assistant']),
    ])
    setEquipo(eq || [])
    supabase.from('profiles').select('id, full_name').then(({ data: ps }) => setTodosNombres(Object.fromEntries((ps || []).map((x) => [x.id, x.full_name]))))
    setCuentas(c || [])
    setPlanes(p || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const cuenta = (id) => cuentas.find((c) => c.id === id)
  const usuarioDe = (id) => cuenta(id)?.username || ''
  const nombreDe = (id) => equipo.find((x) => x.id === id)?.full_name || todosNombres[id] || '—'
  const delFiltro = useMemo(() => planes.filter((p) => filtro === 'todas' || p.account_id === filtro), [planes, filtro])
  const borradores = delFiltro.filter((p) => p.estado === 'borrador')
  const visibles = delFiltro.filter((p) => p.estado !== 'borrador')
  const texto = useMemo(() => (ed ? textoPlan(ed, usuarioDe(ed.account_id) || 'cuenta') : ''), [ed, cuentas])
  const totalReels = (p) => (p.dias || []).reduce((a, d) => a + (d.reels?.length || 0), 0)

  // Avisos y reglas: se reutilizan los de la última planificación guardada (de la misma cuenta si la hay)
  function ultimasReglas(accountId) {
    const con = planes.filter((p) => typeof p.reglas === 'string')
    return (con.find((p) => p.account_id === accountId) || con[0])?.reglas || ''
  }
  function cambiarCuenta(id) {
    setEd((e) => {
      const sinTocar = !e.id && e.reglas === ultimasReglas(e.account_id)
      return { ...e, account_id: id, reglas: sinTocar ? ultimasReglas(id) : e.reglas }
    })
  }

  // ---- Autoguardado como borrador ----
  const [auto, setAuto] = useState({ estado: '', hora: '' }) // '' | pendiente | ok | error
  const baseRef = useRef('')
  const ocupadoRef = useRef(false)
  const instantanea = (e) => JSON.stringify({ a: e.account_id, t: e.titulo, r: e.reglas, m: e.mostrar_resumen, p: e.responsable_id, d: e.dias })
  const tieneContenido = (e) => e.dias.some((d) => d.reels.some((r) => r.link || r.gancho || r.texto || r.tematica || r.prueba))
  // Una planificación nueva o que ya es borrador se autoguarda; las guardadas/enviadas no (no se les cambia el estado sin querer)
  const autoguardable = (e) => !!e && !!e.account_id && (e.id ? e.estado === 'borrador' : true)

  const pendRef = useRef(null)   // último estado que no pudo guardarse porque había otro guardado en curso
  const edRef = useRef(null)     // siempre el estado más reciente (para guardar al salir)
  const autoRef = useRef(null)
  edRef.current = ed

  async function autoGuardar(e) {
    if (ocupadoRef.current) { pendRef.current = e; return }
    ocupadoRef.current = true
    const payload = {
      account_id: e.account_id, titulo: e.titulo.trim() || tituloHoy(), reglas: e.reglas.trim(), mostrar_resumen: e.mostrar_resumen,
      dias: e.dias, estado: 'borrador', responsable_id: e.responsable_id || profile?.id || null,
    }
    const { data, error } = e.id
      ? await supabase.from('ig_plans').update(payload).eq('id', e.id).select().single()
      : await supabase.from('ig_plans').insert([payload]).select().single()
    ocupadoRef.current = false
    if (error) { setAuto({ estado: 'error', hora: '' }); return false }
    baseRef.current = instantanea(e)
    if (pendRef.current) { // había cambios nuevos mientras se guardaba: se guardan también (ya con el id)
      const n = pendRef.current
      pendRef.current = null
      if (instantanea(n) !== baseRef.current) autoGuardar({ ...n, id: n.id || data.id })
    }
    setEd((x) => (x && (x.id === e.id || (!x.id && !e.id)) ? { ...x, id: data.id, estado: 'borrador', created_at: data.created_at } : x))
    setAuto({ estado: 'ok', hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) })
    setToast('✓ Borrador guardado correctamente')
    setTimeout(() => setToast(''), 3500)
    cargar(true)
    return true
  }

  useEffect(() => {
    if (!ed) return undefined
    const snap = instantanea(ed)
    if (snap === baseRef.current) return undefined
    if (!autoguardable(ed)) { if (ed.id) setAuto((a) => (a.estado === 'pendiente' ? a : { estado: 'pendiente', hora: '' })); return undefined }
    setAuto((a) => (a.estado === 'pendiente' ? a : { estado: 'pendiente', hora: '' }))
    const t = setTimeout(() => { autoGuardar(ed) }, 1500)
    return () => clearTimeout(t)
  }, [ed])

  async function volver() {
    if (ed && instantanea(ed) !== baseRef.current) {
      if (autoguardable(ed)) await autoGuardar(ed)
      else if (!confirm('Tienes cambios sin guardar en esta planificación. ¿Salir sin guardar?')) return
    }
    setEd(null)
  }

  // Si se abandona el apartado de golpe (otro menú, cambio de pestaña o cierre), se guarda el borrador al instante
  autoRef.current = autoGuardar
  useEffect(() => {
    function guardarYa() {
      const e = edRef.current
      if (e && instantanea(e) !== baseRef.current && autoguardable(e)) autoRef.current(e)
    }
    const alOcultar = () => { if (document.visibilityState === 'hidden') guardarYa() }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', guardarYa)
    window.addEventListener('beforeunload', guardarYa)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', guardarYa)
      window.removeEventListener('beforeunload', guardarYa)
      guardarYa() // al salir de esta pantalla
    }
  }, [])

  function nueva() {
    setMsg(''); setErr('')
    const acc = filtro !== 'todas' ? filtro : (cuentas[0]?.id || '')
    const inicial = { ...VACIA, account_id: acc, titulo: tituloHoy(), reglas: ultimasReglas(acc), responsable_id: profile?.id || '', dias: estructura(7, 2) }
    baseRef.current = instantanea(inicial)
    setEd(inicial)
    setNDias(7); setNPorDia(2)
    setAuto({ estado: '', hora: '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function abrir(p) {
    setMsg(''); setErr('')
    const abierta = { id: p.id, account_id: p.account_id, titulo: p.titulo, reglas: p.reglas || '', mostrar_resumen: p.mostrar_resumen, estado: p.estado || 'guardada', responsable_id: p.responsable_id || '', created_at: p.created_at, dias: JSON.parse(JSON.stringify(p.dias || [])) }
    baseRef.current = instantanea(abierta); setAuto({ estado: '', hora: '' })
    setEd(abierta)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // Mismo esquema (días, reels, nuevo/ganador y tipo) pero sin enlaces ni textos: punto de partida de la semana siguiente
  function duplicarEstructura(p) {
    setMsg(''); setErr('')
    setAuto({ estado: '', hora: '' })
    const copia = {
      id: null, account_id: p.account_id, titulo: tituloHoy(), reglas: ultimasReglas(p.account_id) || p.reglas || '', mostrar_resumen: p.mostrar_resumen, estado: 'guardada', responsable_id: profile?.id || '', created_at: null,
      dias: (p.dias || []).map((d) => ({ reels: (d.reels || []).map((r) => ({ origen: r.origen, tipo: r.tipo, link: '', gancho: '', texto: '', tematica: '', prueba: false })) })),
    }
    baseRef.current = instantanea(copia)
    setEd(copia)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function crearEstructura() {
    const hayContenido = ed.dias.some((d) => d.reels.some((r) => r.link || r.gancho || r.texto))
    if (hayContenido && !confirm('Esto reemplaza los días y reels actuales, y se pierde lo que ya has escrito. ¿Continuar?')) return
    setEd({ ...ed, dias: estructura(Math.min(Math.max(nDias, 1), 14), Math.min(Math.max(nPorDia, 1), 8)) })
  }
  const setDias = (fn) => setEd((e) => ({ ...e, dias: fn(e.dias) }))
  const setReel = (di, ri, k, v) => setDias((ds) => ds.map((d, i) => (i !== di ? d : { ...d, reels: d.reels.map((r, j) => (j === ri ? { ...r, [k]: v } : r)) })))
  const addReel = (di) => setDias((ds) => ds.map((d, i) => (i === di ? { ...d, reels: [...d.reels, reelVacio(d.reels.length)] } : d)))
  const quitarReel = (di, ri) => setDias((ds) => ds.map((d, i) => (i === di ? { ...d, reels: d.reels.filter((_, j) => j !== ri) } : d)))
  const addDia = () => setDias((ds) => [...ds, { reels: [reelVacio(0), reelVacio(1)] }])
  function quitarDia(di) {
    const d = ed.dias[di]
    if (d.reels.some((r) => r.link || r.gancho || r.texto) && !confirm(`El día ${di + 1} tiene contenido. ¿Quitarlo?`)) return
    setDias((ds) => ds.filter((_, i) => i !== di))
  }

  // destino: 'borrador' | 'guardada'
  async function guardar(destino = 'guardada') {
    setErr(''); setMsg('')
    if (!ed.account_id) { setErr('Elige la cuenta de Instagram.'); return }
    if (ocupadoRef.current) { setErr('Se está autoguardando; vuelve a pulsar en un segundo.'); return }
    setGuardando(true)
    const payload = {
      account_id: ed.account_id,
      // La planificación se identifica por su fecha exacta de creación (ya no por la semana)
      titulo: ed.titulo.trim() || tituloHoy(),
      reglas: ed.reglas.trim(), mostrar_resumen: ed.mostrar_resumen, dias: ed.dias,
      estado: destino, responsable_id: ed.responsable_id || profile?.id || null,
    }
    const { data, error } = ed.id
      ? await supabase.from('ig_plans').update(payload).eq('id', ed.id).select().single()
      : await supabase.from('ig_plans').insert([payload]).select().single()
    setGuardando(false)
    if (error) { setErr(error.message.includes('does not exist') || error.message.includes('column') ? 'Falta ejecutar la migración 52b en Supabase.' : 'No se pudo guardar. Revisa que tengas acceso a esa cuenta.'); return }
    baseRef.current = instantanea({ ...ed, titulo: data.titulo }); setAuto({ estado: '', hora: '' })
    setEd((e) => ({ ...e, id: data.id, titulo: data.titulo, estado: data.estado, created_at: data.created_at }))
    setMsg(destino === 'borrador' ? 'Guardada como borrador.' : 'Guardada.')
    cargar()
  }
  // Marca manual de «ya la he enviado»: solo deja constancia en esta pantalla, no envía nada a ningún sitio
  async function marcarEnviada(p, marcar) {
    if (!marcar && !confirm('¿Quitar la marca de enviada de esta planificación?')) return
    const { error } = await supabase.from('ig_plans').update(marcar ? { enviado_at: new Date().toISOString(), enviado_por: profile?.id || null } : { enviado_at: null, enviado_por: null }).eq('id', p.id)
    if (error) { alert('No se pudo guardar la marca.'); return }
    cargar(true)
  }
  async function borrar(p) {
    if (!confirm(`¿Borrar la planificación «${p.titulo}» de @${sinArroba(usuarioDe(p.account_id))}? No se puede deshacer.`)) return
    const { error } = await supabase.from('ig_plans').delete().eq('id', p.id)
    if (error) { alert('No se pudo borrar.'); return }
    if (ed?.id === p.id) setEd(null)
    cargar()
  }

  return (
    <div>
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-[70] px-4 py-3 rounded-lg text-sm font-medium shadow-lg" style={{ background: 'var(--panel)', border: '1px solid var(--success)', color: 'var(--success)', boxShadow: '0 10px 30px rgba(0,0,0,.45)' }}>
          {toast}
        </div>
      )}
      <PageHeader
        title="Planificaciones de reels"
        subtitle="Confecciona la planificación semanal de cada cuenta con la plantilla y copia el texto listo para enviárselo a la chica."
        action={<Button onClick={nueva} disabled={!cuentas.length}>Nueva planificación</Button>}
      />

      {ed && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <Button variant="ghost" onClick={volver}>← Volver a las planificaciones</Button>
          <span className="text-xs" style={{ color: auto.estado === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
            {auto.estado === 'pendiente' ? 'Cambios sin guardar…' : auto.estado === 'ok' ? `Borrador guardado automáticamente a las ${auto.hora}` : auto.estado === 'error' ? 'No se pudo autoguardar: guarda a mano' : (ed.id && ed.estado !== 'borrador' ? 'Las planificaciones ya guardadas o enviadas no se autoguardan: usa «Guardar»' : 'Se guarda sola como borrador mientras escribes y al salir')}
          </span>
        </div>
      )}
      {ed && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-6 mb-8 items-start">
          <div>
            <Panel className="p-5 mb-4">
              <p className="text-sm font-medium mb-3">{ed.id ? 'Editar planificación' : 'Nueva planificación'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Cuenta de Instagram</label>
                  <Select value={ed.account_id} onChange={(e) => cambiarCuenta(e.target.value)}>
                    <option value="">— Elegir cuenta —</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}{c.models?.stage_name ? ` · ${c.models.stage_name}` : ''}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Responsable</label>
                  <Select value={ed.responsable_id} onChange={(e) => setEd({ ...ed, responsable_id: e.target.value })}>
                    <option value="">— Sin responsable —</option>
                    {!equipo.some((x) => x.id === profile?.id) && profile?.id && <option value={profile.id}>{profile.full_name}</option>}
                    {equipo.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Fecha de la planificación</label>
                  <Input type="date" value={aIso(ed.titulo)} onChange={(e) => setEd({ ...ed, titulo: deIso(e.target.value) || tituloHoy() })} />
                </div>
                <div className="sm:col-span-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: 'var(--text-muted)' }}>
                  <span>{ed.created_at ? `Creada el ${fmtExacta(ed.created_at)}` : 'Se registra quién la crea y la hora exacta al guardar'}</span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--panel-alt)', color: ESTADOS[ed.estado]?.[1] }}>{ESTADOS[ed.estado]?.[0] || ed.estado}</span>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Avisos y reglas (salen debajo del resumen; se guardan y se te proponen en tus próximas planificaciones, puedes modificarlos)</label>
                <textarea
                  value={ed.reglas} onChange={(e) => setEd({ ...ed, reglas: e.target.value })} rows={3}
                  placeholder="Escribe aquí tus avisos y reglas (opcional)"
                  className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                  style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm mb-4">
                <input type="checkbox" checked={ed.mostrar_resumen} onChange={(e) => setEd({ ...ed, mostrar_resumen: e.target.checked })} />
                Incluir el resumen (cuántos reels hay de cada tipo: nuevo / ganador × sugerente / marca personal), calculado solo con lo que has puesto
              </label>
              <div className="p-3 rounded-md flex flex-wrap items-end gap-3" style={{ background: 'var(--panel-alt)' }}>
                <div className="w-24">
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Días</label>
                  <Input type="number" min={1} max={14} value={nDias} onChange={(e) => setNDias(Number(e.target.value) || 1)} />
                </div>
                <div className="w-32">
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Reels por día</label>
                  <Input type="number" min={1} max={8} value={nPorDia} onChange={(e) => setNPorDia(Number(e.target.value) || 1)} />
                </div>
                <Button variant="ghost" onClick={crearEstructura}>Crear estructura</Button>
                <p className="text-xs flex-1 min-w-[180px]" style={{ color: 'var(--text-muted)' }}>Después puedes añadir o quitar días y reels sueltos, y cambiar cada reel a nuevo/ganador y sugerente/marca personal.</p>
              </div>
            </Panel>

            {ed.dias.map((d, di) => (
              <Panel key={di} className="p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">DÍA {di + 1} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {plural(d.reels.length, 'reel', 'reels')}</span></p>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => addReel(di)} className="hover:underline" style={{ color: 'var(--accent)' }}>+ Añadir reel</button>
                    <button onClick={() => quitarDia(di)} className="hover:underline" style={{ color: 'var(--danger)' }}>Quitar día</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {d.reels.map((r, ri) => (
                    <div key={ri} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <Select value={r.origen} onChange={(e) => setReel(di, ri, 'origen', e.target.value)}>
                          {ORIGENES.map((o) => <option key={o.id} value={o.id}>{o.n}</option>)}
                        </Select>
                        <Select value={r.tipo} onChange={(e) => setReel(di, ri, 'tipo', e.target.value)}>
                          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}
                        </Select>
                        <Input placeholder="🎯 Temática (opcional)" value={r.tematica || ''} onChange={(e) => setReel(di, ri, 'tematica', e.target.value)} />
                      </div>
                      <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                        <input type="checkbox" checked={!!r.prueba} onChange={(e) => setReel(di, ri, 'prueba', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        🧪 Reel de prueba <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(opcional)</span>
                      </label>
                      <div className="space-y-2">
                        <Input placeholder="🔗 Enlace del reel de referencia" value={r.link} onChange={(e) => setReel(di, ri, 'link', e.target.value)} />
                        <Input placeholder="🎣 Gancho" value={r.gancho} onChange={(e) => setReel(di, ri, 'gancho', e.target.value)} />
                        <Input placeholder="📝 Texto / indicaciones" value={r.texto} onChange={(e) => setReel(di, ri, 'texto', e.target.value)} />
                      </div>
                      {d.reels.length > 1 && (
                        <button onClick={() => quitarReel(di, ri)} className="text-xs hover:underline mt-2" style={{ color: 'var(--danger)' }}>Quitar este reel</button>
                      )}
                    </div>
                  ))}
                  {d.reels.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Día sin reels. Añade uno.</p>}
                </div>
              </Panel>
            ))}
            <Button variant="ghost" onClick={addDia}>+ Añadir día</Button>
          </div>

          <div className="xl:sticky xl:top-4">
            <Panel className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <p className="text-sm font-medium">Texto para copiar</p>
                <CopyButton text={texto} label="Copiar todo" />
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words rounded-md p-3 max-h-[60vh] overflow-y-auto" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', fontFamily: 'inherit' }}>{texto}</pre>
              {ed.dias.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {ed.dias.map((d, i) => <CopyButton key={i} text={textoDia(d, i)} label={`Copiar día ${i + 1}`} />)}
                </div>
              )}
              {err && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{err}</p>}
              {msg && <p className="text-sm mt-3" style={{ color: 'var(--success)' }}>{msg}</p>}
              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={() => guardar('guardada')} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
                <Button variant="ghost" onClick={() => guardar('borrador')} disabled={guardando}>Guardar como borrador</Button>
                <Button variant="ghost" onClick={volver}>Cerrar</Button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Cuando ya se la hayas pasado a la modelo, márcala como enviada desde la lista principal (es solo una marca, no se envía nada). Los borradores quedan en la pestaña «Borradores» para revisarlos antes.
              </p>
            </Panel>
          </div>
        </div>
      )}

      <Panel className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex gap-2">
            {[['planes', `Planificaciones (${visibles.length})`], ['borradores', `Borradores (${borradores.length})`]].map(([id, label]) => (
              <button
                key={id} onClick={() => setVista(id)} className="px-3 py-1.5 rounded-full text-sm"
                style={{ background: vista === id ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${vista === id ? 'var(--accent)' : 'var(--border)'}`, color: vista === id ? 'var(--accent)' : 'var(--text)' }}
              >{label}</button>
            ))}
          </div>
          <div className="min-w-[220px]">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todas">Todas las cuentas</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}</option>)}
            </Select>
          </div>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (vista === 'planes' ? visibles : borradores).length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
            {vista === 'planes' ? 'Todavía no hay planificaciones. Pulsa «Nueva planificación».' : 'No hay borradores. Usa «Guardar como borrador» en una planificación para dejarla pendiente de revisar.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cuenta', 'Fecha de creación', 'Responsable', 'Estado', 'Contenido', ''].map((c) => <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {(vista === 'planes' ? visibles : borradores).map((p) => {
                  const est = ESTADOS[p.estado] || ESTADOS.guardada
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 whitespace-nowrap"><strong>@{sinArroba(usuarioDe(p.account_id))}</strong></td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtExacta(p.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{nombreDe(p.responsable_id || p.created_by)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span style={{ color: est[1] }}>{est[0]}</span>
                        {p.estado !== 'borrador' && p.enviado_at && <span className="text-xs block" style={{ color: 'var(--success)' }}>✓ Enviada · {fmtExacta(p.enviado_at)}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{plural((p.dias || []).length, 'día', 'días')} · {plural(totalReels(p), 'reel', 'reels')}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Link to={`/planificaciones/${p.id}`} className="text-xs underline mr-3" style={{ color: 'var(--accent)' }}>👁 Ver</Link>
                        <button className="text-xs underline mr-3" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/planificaciones/${p.id}`).catch(() => {}); alert('Link copiado.') }}>🔗 Copiar link</button>
                        <button className="text-xs underline mr-3" onClick={() => abrir(p)}>Abrir / editar</button>
                        <button className="text-xs underline mr-3" onClick={() => { navigator.clipboard.writeText(textoPlan(p, usuarioDe(p.account_id))).catch(() => {}); setMsg(''); alert('Texto copiado.') }}>Copiar texto</button>
                        {p.estado !== 'borrador' && (p.enviado_at
                          ? <button className="text-xs underline mr-3" onClick={() => marcarEnviada(p, false)}>Quitar marca de enviada</button>
                          : <button className="text-xs underline mr-3" style={{ color: 'var(--success)' }} onClick={() => marcarEnviada(p, true)}>✓ Marcar como enviada</button>)}
                        <button className="text-xs underline mr-3" onClick={() => duplicarEstructura(p)}>Duplicar estructura</button>
                        {puedeBorrar && <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(p)}>Borrar</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
