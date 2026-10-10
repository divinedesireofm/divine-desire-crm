import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { PAISES, COLOR_MANUAL, COLOR_PERSONA } from '../lib/festividades'
import { iso, aDate, sumarDias, difDias, TIPOS, esLegacy, calcularEventos } from '../lib/fechasEventos'

const fmtLargo = (s) => aDate(s).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' })
const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const LS_PAISES = 'dd_paises_fechas'
const PAISES_DEFECTO = ['es', 've']
const COLORES_SUGERIDOS = ['#ec4899', '#22d3ee', '#a3e635', '#fb923c', '#f472b6', '#60a5fa']

const EMPTY = { tipo: 'otra', titulo: '', fecha: '', recurrente: true, notas: '', persona: '', pais_id: '' } // persona: 'perfil:<id>' | 'modelo:<id>' | ''

export default function ImportantDates() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [modelos, setModelos] = useState([])
  const [custom, setCustom] = useState([])          // países creados por el equipo
  const [paisesEquipo, setPaisesEquipo] = useState(PAISES_DEFECTO) // los que usan los avisos de la campana
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [paises, setPaises] = useState(null) // selección de esta persona (null = aún sin cargar)
  const [selector, setSelector] = useState(false)
  const [nuevoPais, setNuevoPais] = useState(null) // { nombre, color }
  const [vista, setVista] = useState('lista')
  const [verOcultas, setVerOcultas] = useState(false)
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [dia, setDia] = useState(null)
  const [msg, setMsg] = useState('')
  const hoy = iso(new Date())

  async function load() {
    setLoading(true)
    const consultas = [
      supabase.rpc('fechas_visibles'),
      supabase.from('paises_fechas').select('id, nombre, color').order('nombre'),
      supabase.from('fechas_config').select('valor').eq('clave', 'paises').maybeSingle(),
    ]
    if (puedeGestionar) {
      consultas.push(
        supabase.from('profiles').select('id, full_name, active').order('full_name'),
        supabase.from('models').select('id, stage_name, status').order('stage_name'),
      )
    }
    const [r1, r2, r3, r4, r5] = await Promise.all(consultas)
    if (r1.error) setError('No se pudieron cargar las fechas: ' + r1.error.message + ' (¿has ejecutado la migración 51?)')
    else setError('')
    setRows(r1.data || [])
    setCustom(r2.data || [])
    const equipo = Array.isArray(r3.data?.valor) ? r3.data.valor : PAISES_DEFECTO
    setPaisesEquipo(equipo)
    setPerfiles((r4 && r4.data) || []); setModelos((r5 && r5.data) || [])
    // Primera carga: la selección guardada en este navegador, o si no hay, la del equipo
    setPaises((p) => {
      if (p) return p
      try { const v = JSON.parse(localStorage.getItem(LS_PAISES)); if (Array.isArray(v)) return v } catch { /* sin almacenamiento */ }
      return equipo
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function guardarLocal(n) {
    setPaises(n)
    try { localStorage.setItem(LS_PAISES, JSON.stringify(n)) } catch { /* sin almacenamiento */ }
  }
  const alternarPais = (id) => guardarLocal(paises.includes(id) ? paises.filter((x) => x !== id) : [...paises, id])

  async function aplicarAlEquipo() {
    const { error: err } = await supabase.from('fechas_config').upsert({ clave: 'paises', valor: paises, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
    if (err) { setMsg('No se pudo guardar: ' + err.message); return }
    setPaisesEquipo(paises)
    setMsg('Listo: los avisos de la campana de todo el equipo usarán estos países.')
    setTimeout(() => setMsg(''), 6000)
  }
  async function crearPais(e) {
    e.preventDefault()
    const nombre = nuevoPais.nombre.trim()
    if (!nombre) return
    const { data, error: err } = await supabase.from('paises_fechas').insert([{ nombre, color: nuevoPais.color, creado_por: profile.id }]).select('id, nombre, color').single()
    if (err) { setMsg('No se pudo crear: ' + err.message); return }
    setCustom((c) => [...c, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    guardarLocal([...paises, 'c:' + data.id])
    setNuevoPais(null)
  }
  async function borrarPais(c) {
    if (!confirm(`¿Eliminar "${c.nombre}" y todas las fechas que tiene guardadas?`)) return
    await supabase.from('paises_fechas').delete().eq('id', c.id)
    guardarLocal(paises.filter((x) => x !== 'c:' + c.id))
    load()
  }

  async function crear(e) {
    e.preventDefault()
    if (!form.fecha) return
    let titulo = form.titulo.trim(), persona_tipo = null, persona_id = null
    if (form.tipo !== 'otra' && form.persona) {
      const [pt, pid] = form.persona.split(':')
      persona_tipo = pt; persona_id = pid
      const nombre = pt === 'modelo' ? modelos.find((m) => m.id === pid)?.stage_name : perfiles.find((p) => p.id === pid)?.full_name
      titulo = `${form.tipo === 'cumpleanos' ? 'Cumpleaños' : 'Aniversario'} de ${nombre}`
    }
    if (!titulo) return
    const { error: err } = await supabase.from('important_dates').insert([{
      titulo, fecha: form.fecha, recurrente: form.tipo === 'otra' ? form.recurrente : true,
      notas: form.notas.trim() || null, creado_por: profile.id, tipo: form.tipo, persona_tipo, persona_id,
      pais_id: form.tipo === 'otra' && form.pais_id ? form.pais_id : null,
    }])
    if (err) { setMsg('No se pudo guardar: ' + err.message); return }
    if (form.tipo === 'otra' && form.pais_id && !paises.includes('c:' + form.pais_id)) guardarLocal([...paises, 'c:' + form.pais_id])
    setForm(EMPTY); setShowForm(false); load()
  }
  async function limpiarLegacy() {
    if (!confirm(`¿Quitar ${legacy.length} festividades añadidas con el botón anterior? Ahora se generan solas al elegir países.`)) return
    await supabase.from('important_dates').delete().in('id', legacy.map((r) => r.id))
    load()
  }
  async function borrar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"?`)) return
    await supabase.from('important_dates').delete().eq('id', r.id)
    load()
  }

  const sel = paises || []
  const eventosEnRango = (desde, hasta) => calcularEventos({ rows, paises: sel, custom, desde, hasta })
  const proximos = useMemo(() => eventosEnRango(hoy, sumarDias(hoy, 365)), [paises, rows, custom])
  const legacy = rows.filter(esLegacy)
  const ocultas = rows.filter((r) => r.vigente === false)
  const pasadas = rows.filter((r) => !(r.recurrente || r.tipo !== 'otra') && r.fecha < hoy && r.vigente !== false).sort((a, b) => b.fecha.localeCompare(a.fecha))

  // ---- calendario ----
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const lead = (primero.getDay() + 6) % 7
    const n = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
    const arr = Array(lead).fill(null)
    for (let i = 1; i <= n; i++) arr.push(iso(new Date(mes.getFullYear(), mes.getMonth(), i)))
    while (arr.length % 7) arr.push(null)
    return arr
  }, [mes])
  const eventosMes = useMemo(() => {
    const d0 = iso(new Date(mes.getFullYear(), mes.getMonth(), 1)), d1 = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0))
    const m = {}
    eventosEnRango(d0, d1).forEach((e) => { (m[e.fecha] = m[e.fecha] || []).push(e) })
    return m
  }, [mes, paises, rows, custom])

  const lbl = { color: 'var(--text-muted)' }
  const Item = ({ e }) => {
    const dias = difDias(e.fecha, hoy)
    return (
      <div className="p-3.5 flex items-center justify-between gap-3" style={{ borderLeft: `4px solid ${e.color}` }}>
        <div className="min-w-0">
          <p className="text-sm font-medium">{e.titulo}</p>
          <p className="text-xs flex items-center gap-1.5 flex-wrap" style={lbl}>
            <span>{fmtLargo(e.fecha)}{e.fecha.slice(0, 4) !== hoy.slice(0, 4) ? ' ' + e.fecha.slice(0, 4) : ''}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: `${e.color}26`, color: e.color }}>{e.etiqueta}</span>
            {e.notas && <span>· {e.notas}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: dias >= 0 && dias <= 7 ? 'var(--danger)22' : 'var(--panel-alt)', color: dias >= 0 && dias <= 7 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {dias < 0 ? 'pasada' : dias === 0 ? '¡Hoy!' : dias === 1 ? 'Mañana' : `en ${dias} días`}
          </span>
          {puedeGestionar && e.borrable && <button onClick={() => borrar(e.borrable)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>}
        </div>
      </div>
    )
  }

  const personasForm = (
    <Select value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })}>
      <option value="">— Otra persona (escribir título) —</option>
      <optgroup label="Equipo">{perfiles.filter((p) => p.active !== false).map((p) => <option key={p.id} value={`perfil:${p.id}`}>{p.full_name}</option>)}</optgroup>
      <optgroup label="Modelos">{modelos.filter((m) => m.status !== 'baja').map((m) => <option key={m.id} value={`modelo:${m.id}`}>{m.stage_name}</option>)}</optgroup>
    </Select>
  )

  // Chips de países ya elegidos y lista de los que se pueden añadir
  const fichaPais = (id) => {
    if (id.startsWith('c:')) { const c = custom.find((x) => x.id === id.slice(2)); return c ? { id, n: c.nombre, color: c.color, propio: c } : null }
    const p = PAISES.find((x) => x.id === id); return p ? { id, n: p.n, color: p.color } : null
  }
  const elegidos = sel.map(fichaPais).filter(Boolean)
  const disponibles = [...PAISES.map((p) => p.id), ...custom.map((c) => 'c:' + c.id)].filter((id) => !sel.includes(id)).map(fichaPais).filter(Boolean)
  const mismoQueEquipo = sel.length === paisesEquipo.length && sel.every((x) => paisesEquipo.includes(x))
  const nombresEquipo = paisesEquipo.map(fichaPais).filter(Boolean).map((p) => p.n).join(', ') || 'ninguno'

  return (
    <div>
      <PageHeader
        title="Fechas importantes"
        subtitle="Festividades por país, fechas del equipo, cumpleaños y aniversarios. Todo el equipo y las modelos reciben un aviso 1 semana, 2 días, 1 día antes y el mismo día."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir fecha'}</Button>}
      />

      {error && <Panel className="p-4 mb-4"><p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p></Panel>}
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{msg}</p>}

      {/* Países */}
      <Panel className="p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs" style={lbl}>Países que estás viendo</p>
          <button onClick={() => setSelector(!selector)} className="text-xs px-3 py-1 rounded-full" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
            {selector ? 'Cerrar' : '+ Añadir país'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {elegidos.length === 0 && <span className="text-sm" style={lbl}>Ningún país elegido: solo verás las fechas del equipo.</span>}
          {elegidos.map((p) => (
            <button key={p.id} onClick={() => alternarPais(p.id)} title="Quitar de la vista" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
              style={{ background: `${p.color}24`, border: `1px solid ${p.color}`, color: p.color }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: p.color }} />{p.n}<span style={{ opacity: 0.7 }}>✕</span>
            </button>
          ))}
        </div>

        {selector && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs mb-2" style={lbl}>Pulsa un país para añadirlo</p>
            <div className="flex flex-wrap gap-2">
              {disponibles.map((p) => (
                <span key={p.id} className="inline-flex items-center">
                  <button onClick={() => alternarPais(p.id)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                    style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: p.color }} />{p.n}
                  </button>
                  {puedeGestionar && p.propio && <button onClick={() => borrarPais(p.propio)} className="text-xs ml-1" style={{ color: 'var(--danger)' }} title="Eliminar este país">✕</button>}
                </span>
              ))}
              {disponibles.length === 0 && <span className="text-sm" style={lbl}>Ya has añadido todos.</span>}
            </div>
            {puedeGestionar && (
              nuevoPais ? (
                <form onSubmit={crearPais} className="flex flex-wrap items-center gap-2 mt-3">
                  <div className="min-w-[200px]"><Input placeholder="Nombre (ej: Panamá, o «Cumples del equipo»)" value={nuevoPais.nombre} onChange={(e) => setNuevoPais({ ...nuevoPais, nombre: e.target.value })} required /></div>
                  <input type="color" value={nuevoPais.color} onChange={(e) => setNuevoPais({ ...nuevoPais, color: e.target.value })} aria-label="Color" style={{ width: 40, height: 36, background: 'none', border: 'none' }} />
                  <Button type="submit">Crear</Button>
                  <Button type="button" variant="ghost" onClick={() => setNuevoPais(null)}>Cancelar</Button>
                </form>
              ) : (
                <button onClick={() => setNuevoPais({ nombre: '', color: COLORES_SUGERIDOS[custom.length % COLORES_SUGERIDOS.length] })} className="text-xs underline mt-3" style={{ color: 'var(--accent)' }}>
                  ¿Tu país no está en la lista? Crea uno propio (le pones el nombre, el color y sus fechas)
                </button>
              )
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-3 text-xs" style={lbl}>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 5, background: COLOR_MANUAL }} /> Fechas del equipo</span>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 5, background: COLOR_PERSONA }} /> Cumpleaños y aniversarios</span>
        </div>
        <p className="text-xs mt-2" style={lbl}>
          Los avisos de la campana usan los países del equipo: <strong>{nombresEquipo}</strong>.
          {puedeGestionar && !mismoQueEquipo && (
            <button onClick={aplicarAlEquipo} className="underline ml-1" style={{ color: 'var(--accent)' }}>Usar mi selección actual para los avisos de todos</button>
          )}
        </p>
      </Panel>

      {puedeGestionar && legacy.length > 0 && (
        <Panel className="p-4 mb-4" style={{ borderColor: 'var(--accent)' }}>
          <p className="text-sm">Tienes <strong>{legacy.length}</strong> festividades guardadas a mano con el botón anterior; ahora salen solas por país y aparecerían duplicadas. <button onClick={limpiarLegacy} className="underline ml-1" style={{ color: 'var(--accent)' }}>Quitarlas</button></p>
        </Panel>
      )}

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1" style={lbl}>Tipo</label>
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={lbl}>{form.tipo === 'cumpleanos' ? 'Fecha de nacimiento' : form.tipo === 'aniversario' ? 'Fecha de inicio (entrada)' : 'Fecha'}</label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
            {form.tipo !== 'otra' && (
              <div className="sm:col-span-2">
                <label className="text-xs block mb-1" style={lbl}>Persona (si ya no está en el CRM, la fecha deja de mostrarse)</label>
                {personasForm}
              </div>
            )}
            {(form.tipo === 'otra' || !form.persona) && (
              <div className="sm:col-span-2">
                <label className="text-xs block mb-1" style={lbl}>Título</label>
                <Input placeholder={form.tipo === 'otra' ? 'Ej: Reunión trimestral' : 'Ej: Cumpleaños de mi hermana'} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
              </div>
            )}
            {form.tipo === 'otra' && custom.length > 0 && (
              <div className="sm:col-span-2">
                <label className="text-xs block mb-1" style={lbl}>País propio (opcional)</label>
                <Select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })}>
                  <option value="">— Ninguno: fecha del equipo, siempre visible —</option>
                  {custom.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </div>
            )}
            {form.tipo === 'otra' ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.recurrente} onChange={(e) => setForm({ ...form, recurrente: e.target.checked })} />
                Se repite cada año
              </label>
            ) : <p className="text-xs sm:col-span-2" style={lbl}>Los cumpleaños y aniversarios se repiten automáticamente cada año.</p>}
            <div className="sm:col-span-2"><Input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
            <Button type="submit" className="sm:col-span-2">Guardar</Button>
          </form>
        </Panel>
      )}

      <div className="flex items-center gap-2 mb-3">
        {[['lista', 'Próximas'], ['calendario', 'Calendario']].map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)} className="px-4 py-1.5 rounded-md text-sm font-medium"
            style={{ background: vista === k ? 'var(--accent)' : 'var(--panel-alt)', color: vista === k ? '#000' : 'var(--text)', border: '1px solid ' + (vista === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>
        ))}
        {puedeGestionar && ocultas.length > 0 && (
          <button onClick={() => setVerOcultas(!verOcultas)} className="ml-auto text-xs hover:underline" style={lbl}>
            {verOcultas ? 'Ocultar' : 'Ver'} {ocultas.length} {ocultas.length === 1 ? 'fecha de una persona que ya no está' : 'fechas de personas que ya no están'}
          </button>
        )}
      </div>

      {loading ? <Panel><p className="p-6 text-sm" style={lbl}>Cargando…</p></Panel> : vista === 'lista' ? (
        <Panel>
          {proximos.length === 0 ? (
            <p className="p-6 text-sm" style={lbl}>No hay fechas en los próximos 12 meses. Añade algún país{puedeGestionar ? ' o una fecha' : ''}.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {proximos.map((e, i) => {
                const nuevoMes = i === 0 || e.fecha.slice(0, 7) !== proximos[i - 1].fecha.slice(0, 7)
                return (
                  <div key={e.key}>
                    {nuevoMes && <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide" style={{ ...lbl, background: 'var(--panel-alt)' }}>{NOMBRE_MES[Number(e.fecha.slice(5, 7)) - 1]} {e.fecha.slice(0, 4)}</p>}
                    <Item e={e} />
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="px-2 py-1 rounded hover:opacity-70" aria-label="Mes anterior">←</button>
              <p className="font-medium">{NOMBRE_MES[mes.getMonth()]} {mes.getFullYear()}</p>
              <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="px-2 py-1 rounded hover:opacity-70" aria-label="Mes siguiente">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1" style={lbl}>{DIAS_SEM.map((d) => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((s, i) => {
                if (!s) return <div key={i} />
                const ev = eventosMes[s] || []
                const on = dia === s
                return (
                  <button key={s} onClick={() => setDia(on ? null : s)} className="rounded-md py-2 text-sm flex flex-col items-center gap-1 min-h-[54px]"
                    style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : s === hoy ? 'var(--text-muted)' : 'var(--border)'}`, fontWeight: s === hoy ? 700 : 400 }}>
                    <span>{Number(s.slice(8))}</span>
                    <span className="flex gap-0.5 flex-wrap justify-center h-2">
                      {ev.slice(0, 4).map((e) => <span key={e.key} style={{ width: 6, height: 6, borderRadius: 3, background: e.color }} />)}
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
          <Panel>
            {dia ? (
              (eventosMes[dia] || []).length ? <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{eventosMes[dia].map((e) => <Item key={e.key} e={e} />)}</div>
                : <p className="p-5 text-sm" style={lbl}>Nada el {fmtLargo(dia)}.</p>
            ) : <p className="p-5 text-sm" style={lbl}>Pulsa un día para ver sus fechas.</p>}
          </Panel>
        </div>
      )}

      {puedeGestionar && verOcultas && ocultas.length > 0 && (
        <Panel className="mt-4">
          <p className="px-4 pt-3 pb-1 text-xs font-medium" style={lbl}>Personas que ya no están en el CRM (no se repiten)</p>
          {ocultas.map((r) => (
            <div key={r.id} className="p-3.5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)', opacity: 0.7 }}>
              <span className="text-sm">{r.titulo} <span className="text-xs" style={lbl}>· {aDate(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</span></span>
              <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
            </div>
          ))}
        </Panel>
      )}

      {pasadas.length > 0 && (
        <Panel className="mt-4">
          <p className="px-4 pt-3 pb-1 text-xs font-medium" style={lbl}>Fechas puntuales ya pasadas</p>
          {pasadas.map((r) => (
            <div key={r.id} className="p-3.5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)', opacity: 0.7 }}>
              <span className="text-sm">{r.titulo} <span className="text-xs" style={lbl}>· {r.fecha.split('-').reverse().join('/')}</span></span>
              {puedeGestionar && <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>}
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
