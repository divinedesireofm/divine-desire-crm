import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { PAISES, COLOR_MANUAL, COLOR_PERSONA, festividades } from '../lib/festividades'

// ---------- fechas ----------
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const sumarDias = (s, n) => { const d = aDate(s); d.setDate(d.getDate() + n); return iso(d) }
const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
const fmtLargo = (s) => aDate(s).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' })
const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const LS_PAISES = 'dd_paises_fechas'
const PAISES_DEFECTO = ['es', 've']

const TIPOS = { otra: 'Otra fecha', cumpleanos: 'Cumpleaños', aniversario: 'Aniversario' }
// Festividades que se guardaban con el botón del lote anterior: ahora se generan por país, así que se pueden limpiar
const LEGACY_TITULOS = new Set(['Acción de Gracias', 'Asunción de la Virgen', 'Año Nuevo', 'Batalla de Carabobo', 'Black Friday', 'Cinco de Mayo', 'Cyber Monday', 'Declaración de la Independencia de Venezuela', 'Domingo de Pascua', 'Día Internacional de la Mujer', 'Día de Reyes', 'Día de la Independencia de EE. UU.', 'Día de la Independencia de Venezuela', 'Día de la Madre (EE. UU. y Venezuela)', 'Día de la Madre (España)', 'Día del Padre', 'Día del Padre (EE. UU.)', 'Día del Soltero', 'Día del Trabajo', 'Fiesta Nacional de España / Día de la Resistencia Indígena', 'Halloween', 'Inmaculada Concepción', 'Labor Day', 'Memorial Day', 'Natalicio de Simón Bolívar', 'Navidad', 'Nochebuena', 'Nochevieja', 'San Patricio', 'San Valentín', 'Todos los Santos', 'Viernes Santo'])
const LEGACY_NOTAS = new Set(['EE. UU.', 'EE. UU. y México', 'EE. UU. · tercer domingo de junio', 'España', 'España y Venezuela · festivo, revisar turnos', 'España · festivo', 'España · primer domingo de mayo', 'Global', 'Global · fecha clave para promociones y masivos temáticos', 'Global · fecha fuerte para contenido temático', 'Global · fecha fuerte para promos', 'Global · revisar turnos', 'Segundo domingo de mayo · fecha fuerte', 'Venezuela · festivo, revisar turnos', 'Venezuela · festivo, revisar turnos del equipo'])
const esLegacy = (r) => LEGACY_TITULOS.has(r.titulo) && LEGACY_NOTAS.has(r.notas || '')

const EMPTY = { tipo: 'otra', titulo: '', fecha: '', recurrente: true, notas: '', persona: '' } // persona: 'perfil:<id>' | 'modelo:<id>' | ''

// Una fecha guardada que se repite → su aparición dentro de un rango (puede haber varias si el rango abarca años)
function ocurrenciasEnRango(e, desde, hasta) {
  const [y0, m0, d0] = e.fecha.split('-').map(Number)
  const repite = e.recurrente || e.tipo === 'cumpleanos' || e.tipo === 'aniversario'
  if (!repite) return e.fecha >= desde && e.fecha <= hasta ? [e.fecha] : []
  const out = []
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
    if (y < y0) continue
    let d = new Date(y, m0 - 1, d0)
    if (d.getMonth() !== m0 - 1) d = new Date(y, m0 - 1, 28) // 29 de febrero en año no bisiesto
    const s = iso(d)
    if (s >= desde && s <= hasta) out.push(s)
  }
  return out
}

export default function ImportantDates() {
  const { profile, hasAnyRole } = useAuth()
  const puedeGestionar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [rows, setRows] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [modelos, setModelos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [paises, setPaises] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(LS_PAISES)); if (Array.isArray(v)) return v } catch { /* sin almacenamiento */ }
    return PAISES_DEFECTO
  })
  const [vista, setVista] = useState('lista')
  const [verOcultas, setVerOcultas] = useState(false)
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [dia, setDia] = useState(null)
  const hoy = iso(new Date())

  async function load() {
    setLoading(true)
    const [{ data }, { data: pf }, { data: md }] = await Promise.all([
      supabase.from('important_dates').select('*'),
      supabase.from('profiles').select('id, full_name, active').order('full_name'),
      supabase.from('models').select('id, stage_name, status').order('stage_name'),
    ])
    setRows(data || []); setPerfiles(pf || []); setModelos(md || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function alternarPais(id) {
    setPaises((p) => {
      const n = p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
      try { localStorage.setItem(LS_PAISES, JSON.stringify(n)) } catch { /* sin almacenamiento */ }
      return n
    })
  }

  // ¿La persona de esta fecha sigue en el CRM? (perfil activo / modelo que no está de baja)
  function personaVigente(r) {
    if (!r.persona_id) return true
    if (r.persona_tipo === 'modelo') { const m = modelos.find((x) => x.id === r.persona_id); return !!m && m.status !== 'baja' }
    const p = perfiles.find((x) => x.id === r.persona_id); return !!p && p.active !== false
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
    await supabase.from('important_dates').insert([{
      titulo, fecha: form.fecha, recurrente: form.tipo === 'otra' ? form.recurrente : true,
      notas: form.notas.trim() || null, creado_por: profile.id, tipo: form.tipo, persona_tipo, persona_id,
    }])
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

  // Todo lo que cae en un rango: festividades de los países elegidos + fechas guardadas (con repeticiones)
  function eventosEnRango(desde, hasta) {
    const out = []
    festividades(paises, desde, hasta).forEach((f) => {
      const p = PAISES.find((x) => x.id === f.pais)
      out.push({ key: `f-${f.pais}-${f.fecha}-${f.titulo}`, fecha: f.fecha, titulo: f.titulo, color: p.color, etiqueta: p.n, notas: f.tipo === 'celebracion' ? 'Celebración' : 'Festivo', borrable: null })
    })
    rows.forEach((r) => {
      if (!personaVigente(r) || esLegacy(r)) return
      const esPersona = r.tipo === 'cumpleanos' || r.tipo === 'aniversario'
      ocurrenciasEnRango(r, desde, hasta).forEach((f) => {
        const n = Number(f.slice(0, 4)) - Number(r.fecha.slice(0, 4))
        let extra = ''
        if (r.tipo === 'cumpleanos' && n > 0 && n < 100) extra = `cumple ${n}`
        if (r.tipo === 'aniversario' && n > 0) extra = `${n}.º aniversario`
        out.push({
          key: `d-${r.id}-${f}`, fecha: f, titulo: r.titulo, color: esPersona ? COLOR_PERSONA : COLOR_MANUAL,
          etiqueta: esPersona ? TIPOS[r.tipo] : 'Manual', notas: [extra, r.notas].filter(Boolean).join(' · '), borrable: r,
        })
      })
    })
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  const proximos = useMemo(() => eventosEnRango(hoy, sumarDias(hoy, 365)), [paises, rows, perfiles, modelos])
  const legacy = rows.filter(esLegacy)
  const ocultas = rows.filter((r) => !personaVigente(r))
  const pasadas = rows.filter((r) => !(r.recurrente || r.tipo !== 'otra') && r.fecha < hoy && personaVigente(r)).sort((a, b) => b.fecha.localeCompare(a.fecha))

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
  }, [mes, paises, rows, perfiles, modelos])

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

  return (
    <div>
      <PageHeader
        title="Fechas importantes"
        subtitle="Elige los países para ver sus festividades. Tus fechas, cumpleaños y aniversarios se muestran con otros colores."
        action={puedeGestionar && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : '+ Añadir fecha'}</Button>}
      />

      {/* Países */}
      <Panel className="p-4 mb-4">
        <p className="text-xs mb-2" style={lbl}>Países</p>
        <div className="flex flex-wrap gap-2">
          {PAISES.map((p) => {
            const on = paises.includes(p.id)
            return (
              <button key={p.id} onClick={() => alternarPais(p.id)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                style={{ background: on ? `${p.color}24` : 'var(--panel-alt)', border: `1px solid ${on ? p.color : 'var(--border)'}`, color: on ? p.color : 'var(--text-muted)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: on ? p.color : 'var(--border)' }} />{p.n}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs" style={lbl}>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 5, background: COLOR_MANUAL }} /> Fechas añadidas a mano</span>
          <span className="inline-flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 5, background: COLOR_PERSONA }} /> Cumpleaños y aniversarios</span>
        </div>
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
        {ocultas.length > 0 && (
          <button onClick={() => setVerOcultas(!verOcultas)} className="ml-auto text-xs hover:underline" style={lbl}>
            {verOcultas ? 'Ocultar' : 'Ver'} {ocultas.length} {ocultas.length === 1 ? 'fecha de una persona que ya no está' : 'fechas de personas que ya no están'}
          </button>
        )}
      </div>

      {loading ? <Panel><p className="p-6 text-sm" style={lbl}>Cargando…</p></Panel> : vista === 'lista' ? (
        <Panel>
          {proximos.length === 0 ? (
            <p className="p-6 text-sm" style={lbl}>No hay fechas en los próximos 12 meses. Elige algún país o añade una fecha.</p>
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

      {verOcultas && ocultas.length > 0 && (
        <Panel className="mt-4">
          <p className="px-4 pt-3 pb-1 text-xs font-medium" style={lbl}>Personas que ya no están en el CRM (no se repiten)</p>
          {ocultas.map((r) => (
            <div key={r.id} className="p-3.5 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)', opacity: 0.7 }}>
              <span className="text-sm">{r.titulo} <span className="text-xs" style={lbl}>· {aDate(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</span></span>
              {puedeGestionar && <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>}
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
