import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles, getExtrabajadorIds } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import ModelName from '../components/ModelAvatar'
import { TURNOS, turnoDe, colorFormato, setColoresFormato, PALETA, horaPorDefecto, calcularEnviarEn, horaDoble, subirImagenMasivo, urlImagenMasivo, borrarImagenMasivo } from '../lib/masivos'
import { horarioTurno, fechaHoraDoble } from '../lib/horasTurno'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function fechaHoyISO() { return isoDate(new Date()) }

export default function Massives() {
  const [tab, setTab] = useState('cal')
  return (
    <div>
      <PageHeader title="Calendario de masivos" subtitle="Todos los masivos (PPV y demás): qué se envía, a qué modelo, en qué turno y quién lo manda. Y los formatos disponibles." />
      <div className="flex gap-2 mb-5">
        {[['cal', 'Calendario'], ['fmt', 'Formatos']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3 py-1.5 rounded-full text-sm"
            style={{
              background: tab === id ? 'var(--accent-soft)' : 'var(--panel-alt)',
              border: `1px solid ${tab === id ? 'var(--accent)' : 'var(--border)'}`,
              color: tab === id ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'cal' ? <MasivosCal /> : <Formatos />}
    </div>
  )
}

function Foto({ path, alto = 160 }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let vivo = true; urlImagenMasivo(path).then((u) => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [path])
  if (!url) return <div style={{ height: 60 }} className="text-xs" >Cargando foto…</div>
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Contenido del masivo" style={{ maxHeight: alto, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
}

function Capa({ children, onClose }) {
  return (
    <div className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto" style={{ zIndex: 900, background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl my-4">{children}</div>
    </div>
  )
}

function MasivosCal() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager', 'masivos'])
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [rows, setRows] = useState([])
  const [modelos, setModelos] = useState([])
  const [chatters, setChatters] = useState([])
  const [formatos, setFormatos] = useState([])
  const [nombres, setNombres] = useState({})
  const [add, setAdd] = useState(null)
  const [ver, setVer] = useState(null)
  const [dia, setDia] = useState(null)
  const [errCarga, setErrCarga] = useState('')

  const y = ref.getFullYear(), mo = ref.getMonth()
  const first = new Date(y, mo, 1), last = new Date(y, mo + 1, 0)

  async function load() {
    const desde = isoDate(first), hasta = isoDate(last)
    const [r, { data: m }, u, ex, { data: f }] = await Promise.all([
      supabase.from('massive_calendar').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('models').select('id, stage_name').eq('status', 'activa').order('stage_name'),
      getProfilesByRoles(['manager', 'chatter']),
      getExtrabajadorIds(),
      supabase.from('massive_formats').select('*').order('created_at'),
    ])
    if (r.error) { setErrCarga('No se pudo cargar el calendario: ' + r.error.message); setRows([]) } else setErrCarga('')
    const filas = (r.data || []).filter((x) => !ex.has(x.chatter_id))
    // nombres sueltos (sin depender de relaciones entre tablas)
    const mapa = {}
    u.forEach((p) => { mapa['p' + p.id] = p.full_name })
    const modIds = Array.from(new Set(filas.map((x) => x.modelo_id).filter(Boolean)))
    const { data: ms } = modIds.length ? await supabase.from('models').select('id, stage_name').in('id', modIds) : { data: [] }
    ;(ms || []).forEach((x) => { mapa['m' + x.id] = x.stage_name })
    ;(m || []).forEach((x) => { mapa['m' + x.id] = x.stage_name })
    setColoresFormato(f || [])
    setNombres(mapa); setRows(filas); setModelos(m || []); setChatters(u); setFormatos(f || [])
  }
  useEffect(() => { load() }, [y, mo])

  async function borrar(ev) {
    if (!confirm(`¿Eliminar el masivo de ${nombres['m' + ev.modelo_id] || 'la modelo'}?`)) return
    const { error } = await supabase.from('massive_calendar').delete().eq('id', ev.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    if (ev.imagen_path) {
      const { count } = await supabase.from('massive_calendar').select('id', { count: 'exact', head: true }).eq('imagen_path', ev.imagen_path)
      if (!count) await borrarImagenMasivo(ev.imagen_path)
    }
    setRows((rs) => rs.filter((x) => x.id !== ev.id)); setVer(null)
  }

  const byDay = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.fecha] = g[r.fecha] || []).push(r) }
    Object.values(g).forEach((l) => l.sort((a, b) => String(a.enviar_en || '').localeCompare(String(b.enviar_en || ''))))
    return g
  }, [rows])

  const formatosEnMes = useMemo(() => Array.from(new Set(rows.map((r) => r.formato || 'Masivo'))), [rows])
  const startPad = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)
  const hoy = fechaHoyISO()
  const nuevo = (fecha) => setAdd({ fecha, turno: 'noche', chatter_id: chatters[0]?.id || '', modelos: [] })

  return (
    <div>
      <Panel className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setRef(new Date(y, mo - 1, 1))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>‹</button>
            <strong className="min-w-[150px] text-center">{MESES[mo]} {y}</strong>
            <button onClick={() => setRef(new Date(y, mo + 1, 1))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>›</button>
          </div>
          {esMgr && <Button onClick={() => nuevo(hoy)}>+ Asignar masivo</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Cada día tiene 3 franjas fijas: Mañana (arriba), Tarde (en medio) y Noche (abajo).</span>
          {formatosEnMes.length > 0 && <span>· Color = formato:</span>}
          {formatosEnMes.map((f) => <span key={f} className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: colorFormato(f), display: 'inline-block' }} />{f}</span>)}
        </div>
        {errCarga && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{errCarga}</p>}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))', gap: 4, minWidth: 7 * 140 }}>
            {DIAS.map((d) => <div key={d} className="text-xs text-center py-1" style={{ color: 'var(--text-muted)' }}>{d.slice(0, 3)}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={'e' + i} />
              const iso = isoDate(new Date(y, mo, d))
              const evs = byDay[iso] || []
              return (
                <div key={iso} className="rounded-md p-1.5 flex flex-col" style={{ height: 204, background: iso === hoy ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                  <div className="flex justify-between text-xs mb-1" style={{ height: 18 }}>
                    <span>{d}</span>
                    {esMgr && <span onClick={() => nuevo(iso)} className="cursor-pointer leading-none select-none hover:opacity-80" style={{ color: 'var(--text-muted)', fontSize: 18, fontWeight: 300, padding: '0 4px' }} title="Añadir masivo">+</span>}
                  </div>
                  {TURNOS.map((t) => {
                    const items = evs.filter((e) => e.turno === t.id)
                    const sin = t.id === 'tarde' ? evs.filter((e) => !turnoDe(e.turno)) : []
                    const todos = items.concat(sin)
                    // Un recuadro por chatter (con cuántos masivos lleva en este turno), para ver de un vistazo quién tiene masivos
                    const porChatter = []
                    todos.forEach((ev) => { let g = porChatter.find((x) => x.id === ev.chatter_id); if (!g) { g = { id: ev.chatter_id, evs: [] }; porChatter.push(g) } g.evs.push(ev) })
                    const MAX = 6
                    const visibles = porChatter.length > MAX ? porChatter.slice(0, MAX - 1) : porChatter
                    return (
                      <div key={t.id} data-franja={t.id} className="flex-1 min-h-0 rounded mb-0.5 px-1 py-0.5 overflow-hidden" style={{ borderLeft: `3px solid ${t.color}`, background: 'rgba(128,128,128,0.07)' }}>
                        <p className="text-[9px] uppercase leading-none mb-0.5" style={{ color: t.color }}>{t.label}</p>
                        <div className="flex flex-wrap gap-0.5">
                          {visibles.map((g) => {
                            const cols = Array.from(new Set(g.evs.map((e) => colorFormato(e.formato))))
                            const fondo = cols.length === 1 ? cols[0] : `linear-gradient(90deg, ${cols.map((c, k) => `${c} ${(k * 100) / cols.length}% ${((k + 1) * 100) / cols.length}%`).join(', ')})`
                            const hechos = g.evs.every((e) => e.enviado_at)
                            const nombre = (nombres['p' + g.id] || '—').split(' ')[0]
                            return (
                              <div key={g.id} data-masivo={g.evs[0].id} data-chatter={g.id}
                                onClick={() => (g.evs.length === 1 ? setVer(g.evs[0]) : setDia({ iso, t, chatter: g.id }))}
                                title={g.evs.map((e) => `${e.formato || 'Masivo'} · ${nombres['m' + e.modelo_id] || ''}`).join('\n')}
                                className="rounded px-1 text-[11px] leading-[15px] cursor-pointer truncate" style={{ background: fondo, color: '#fff', opacity: hechos ? 0.55 : 1, maxWidth: '100%', textShadow: '0 0 2px rgba(0,0,0,.6)' }}>
                                {nombre}{g.evs.length > 1 ? ` ×${g.evs.length}` : ''}{hechos ? ' ✓' : ''}
                              </div>
                            )
                          })}
                          {porChatter.length > MAX && (
                            <div onClick={() => setDia({ iso, t })} className="text-[11px] leading-[15px] cursor-pointer px-1" style={{ color: 'var(--accent)' }}>+{porChatter.length - (MAX - 1)} más</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </Panel>

      {add && (
        <Capa onClose={() => setAdd(null)}>
          <MasivoModal add={add} modelos={modelos} chatters={chatters} formatos={formatos} profile={profile}
            onClose={() => setAdd(null)} onSaved={() => { setAdd(null); load() }} />
        </Capa>
      )}
      {dia && (
        <Capa onClose={() => setDia(null)}>
          <Panel className="p-5">
            <div className="flex justify-between mb-3"><p className="font-medium">{dia.iso.split('-').reverse().join('/')} · {dia.t.label}</p><button onClick={() => setDia(null)} style={{ color: 'var(--text-muted)' }}>✕</button></div>
            {(byDay[dia.iso] || []).filter((e) => (e.turno === dia.t.id || (dia.t.id === 'tarde' && !turnoDe(e.turno))) && (!dia.chatter || e.chatter_id === dia.chatter)).map((ev) => (
              <div key={ev.id} onClick={() => { setDia(null); setVer(ev) }} className="rounded px-2 py-1.5 mb-1.5 text-sm cursor-pointer" style={{ background: colorFormato(ev.formato), color: '#fff', opacity: ev.enviado_at ? 0.6 : 1 }}>
                <b>{(nombres['p' + ev.chatter_id] || '—')}</b> · {ev.formato || 'Masivo'} · {nombres['m' + ev.modelo_id] || ''}{ev.enviar_en ? ' · ' + horaDoble(ev.enviar_en) : ''}{ev.enviado_at ? ' ✓' : ''}
              </div>
            ))}
          </Panel>
        </Capa>
      )}
      {ver && (
        <Capa onClose={() => setVer(null)}>
          <Detalle ev={ver} nombres={nombres} esMgr={esMgr} onClose={() => setVer(null)} onBorrar={() => borrar(ver)}
            onEditar={() => { setAdd({ id: ver.id, fecha: ver.fecha, turno: ver.turno || 'mañana', chatter_id: ver.chatter_id, modelos: [ver.modelo_id], formato_id: ver.formato_id || '', formato: ver.formato || '', mensaje: ver.mensaje || ver.nota || '', imagen_path: ver.imagen_path || '', enviar_en: ver.enviar_en }); setVer(null) }} />
        </Capa>
      )}
    </div>
  )
}

function Detalle({ ev, nombres, esMgr, onClose, onBorrar, onEditar }) {
  const t = turnoDe(ev.turno)
  return (
    <Panel className="p-5" style={{ borderTop: `4px solid ${t?.color || 'var(--border)'}` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium text-lg">{ev.formato || 'Masivo'}</p>
        <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>
      <p className="text-sm mb-1"><ModelName name={nombres['m' + ev.modelo_id]} size={18} /> · {nombres['p' + ev.chatter_id] || '—'}</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        {ev.fecha.split('-').reverse().join('/')}{t ? ` · turno de ${t.label.toLowerCase()}` : ''}{ev.enviar_en ? ` · ${horaDoble(ev.enviar_en)}` : ''}
      </p>
      <p className="text-sm mb-3" style={{ color: ev.enviado_at ? 'var(--success, #30a46c)' : 'var(--text-muted)' }}>
        {ev.enviado_at ? `✓ Enviado el ${fechaHoraDoble(ev.enviado_at)}` : 'Pendiente de enviar'}
      </p>
      {ev.imagen_path && <div className="mb-3"><Foto path={ev.imagen_path} /></div>}
      <div className="rounded-md p-3 mb-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>{ev.mensaje || ev.nota || '(sin mensaje)'}</div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={ev.mensaje || ev.nota || ''} />
        {esMgr && <Button variant="ghost" onClick={onEditar}>Editar</Button>}
        {esMgr && <Button variant="ghost" onClick={onBorrar} style={{ color: 'var(--danger)' }}>Eliminar</Button>}
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
    </Panel>
  )
}

function MasivoModal({ add, modelos, chatters, formatos, profile, onClose, onSaved }) {
  const editando = !!add.id
  const [formatoId, setFormatoId] = useState(add.formato_id || (add.formato ? '__otro' : ''))
  const [formatoTxt, setFormatoTxt] = useState(add.formato_id ? '' : (add.formato || ''))
  const [mensaje, setMensaje] = useState(add.mensaje || '')
  const [imagen, setImagen] = useState(add.imagen_path || '')
  const [subiendo, setSubiendo] = useState(false)
  const [fecha, setFecha] = useState(add.fecha)
  const [turno, setTurno] = useState(add.turno)
  const [hora, setHora] = useState(() => (add.enviar_en ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(add.enviar_en)) : horaPorDefecto(add.fecha, add.turno)))
  const [chatterId, setChatterId] = useState(add.chatter_id)
  const [mods, setMods] = useState(add.modelos || [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  function elegirFormato(id) {
    setFormatoId(id)
    const f = formatos.find((x) => x.id === id)
    if (f && !mensaje.trim()) setMensaje(f.contenido || '')
    else if (f && confirm('¿Reemplazar el mensaje por el texto de este formato?')) setMensaje(f.contenido || '')
  }
  function cambiarTurno(t) { setTurno(t); setHora(horaPorDefecto(fecha, t)) }
  function toggle(id) { setMods((ms) => editando ? [id] : (ms.includes(id) ? ms.filter((x) => x !== id) : ms.concat([id]))) }
  async function foto(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setSubiendo(true); setError('')
    try { const nueva = await subirImagenMasivo({ userId: profile.id, file }); if (imagen && imagen !== add.imagen_path) borrarImagenMasivo(imagen); setImagen(nueva) } catch (ex) { setError(ex.message) }
    setSubiendo(false)
  }

  async function guardar() {
    const f = formatos.find((x) => x.id === formatoId)
    const nombreFormato = f ? f.titulo : formatoTxt.trim()
    if (!nombreFormato) { setError('Elige el formato del masivo (o escribe cuál es).'); return }
    if (!mensaje.trim()) { setError('Escribe el mensaje del masivo.'); return }
    if (!chatterId) { setError('Selecciona el chatter.'); return }
    if (!mods.length) { setError('Selecciona al menos una modelo.'); return }
    if (!/^\d{2}:\d{2}$/.test(hora)) { setError('Indica la hora de envío.'); return }
    setBusy(true); setError('')
    const enviar_en = calcularEnviarEn(fecha, turno, hora).toISOString()
    const comun = { fecha, chatter_id: chatterId, turno, enviar_en, formato_id: f ? f.id : null, formato: nombreFormato, mensaje: mensaje.trim(), imagen_path: imagen || null }
    let error
    if (editando) {
      ;({ error } = await supabase.from('massive_calendar').update({ ...comun, modelo_id: mods[0], enviado_at: null, enviado_por: null }).eq('id', add.id))
    } else {
      ;({ error } = await supabase.from('massive_calendar').insert(mods.map((modelo_id) => ({ ...comun, modelo_id, creado_por: profile.id }))))
    }
    setBusy(false)
    if (error) { setError('No se pudo guardar: ' + error.message); return }
    onSaved()
  }

  return (
    <Panel className="p-5">
      <p className="text-sm font-medium mb-3">{editando ? 'Editar masivo' : 'Asignar masivo'}</p>
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Formato del masivo</label>
      <Select value={formatoId} onChange={(e) => elegirFormato(e.target.value)} style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', marginBottom: 8 }} aria-label="Formato del masivo">
        <option value="">— Elige el formato —</option>
        {formatos.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
        <option value="__otro">Otro (escribirlo)</option>
      </Select>
      {formatoId === '__otro' && <Input placeholder="¿Qué tipo de masivo es?" value={formatoTxt} onChange={(e) => setFormatoTxt(e.target.value)} className="mb-2" />}
      <label className="text-xs mb-1 mt-2 block" style={{ color: 'var(--text-muted)' }}>Mensaje del masivo</label>
      <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={6} placeholder="El texto que tiene que copiar y pegar el chatter"
        className="w-full px-3 py-2 rounded-md text-sm outline-none resize-y mb-2"
        style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      <div className="mb-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={foto} />
        {imagen && <div className="mb-2"><Foto path={imagen} alto={110} /></div>}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={subiendo} className="text-xs underline" style={{ color: 'var(--accent)' }}>
          {subiendo ? 'Subiendo…' : imagen ? '📎 Cambiar foto del contenido' : '📎 Adjuntar foto del contenido que se vende (opcional)'}
        </button>
        {imagen && <button type="button" onClick={() => { if (imagen !== add.imagen_path) borrarImagenMasivo(imagen); setImagen('') }} className="text-xs ml-3" style={{ color: 'var(--danger)' }}>Quitar foto</button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setHora(horaPorDefecto(e.target.value, turno)) }} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Turno</label>
          <Select value={turno} onChange={(e) => cambiarTurno(e.target.value)} aria-label="Turno">
            {TURNOS.map((t) => <option key={t.id} value={t.id}>{t.label} · {horarioTurno(t.id, new Date(fecha + 'T12:00:00'))}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Hora de envío (hora de España)</label>
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Chatter</label>
          <Select value={chatterId} onChange={(e) => setChatterId(e.target.value)} aria-label="Chatter">
            {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </Select>
        </div>
      </div>
      <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>{editando ? 'Modelo' : 'Modelos (toca para seleccionar varias; se crea un masivo por cada una)'}</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {modelos.map((m) => {
          const on = mods.includes(m.id)
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.id)} className="px-3 py-1.5 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}>
              <ModelName name={m.stage_name} size={18} />
            </button>
          )
        })}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Al chatter le llegará un aviso al asignárselo y, 5 minutos antes de la hora de envío, le saldrá en mitad de la pantalla con el mensaje listo para copiar hasta que lo marque como enviado.
      </p>
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex gap-2">
        <Button onClick={guardar} disabled={busy || subiendo}>{busy ? 'Guardando…' : editando ? 'Guardar cambios' : `Guardar${mods.length > 1 ? ` (${mods.length})` : ''}`}</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Panel>
  )
}

function Formatos() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager', 'masivos'])
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('massive_formats').select('*, profiles(full_name)').order('created_at')
    setColoresFormato(data || [])
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      {esMgr && <Button className="mb-4" onClick={() => setEdit({ titulo: '', contenido: '' })}>+ Nuevo formato</Button>}
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin formatos todavía.</p>
      ) : rows.map((f) => (
        <Panel key={f.id} className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="font-medium inline-flex items-center gap-2"><span title={f.color ? 'Color asignado' : 'Color automático'} style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: f.color || colorFormato(f.titulo) }} />{f.titulo}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.profiles?.full_name ? `editado por ${f.profiles.full_name}` : ''}</span>
              <CopyButton text={f.contenido} />
              {esMgr && <button onClick={() => setEdit(f)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>}
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap font-mono" style={{ color: 'var(--text-muted)' }}>{f.contenido}</p>
        </Panel>
      ))}
      {edit && (
        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar formato' : 'Nuevo formato'}</p>
          <Input placeholder="Título" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} className="mb-3" />
          <div className="mb-3" data-colores>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Color en el calendario</p>
            <div className="flex flex-wrap items-center gap-2">
              {PALETA.map((c) => (
                <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })} aria-label={'Color ' + c} data-color={c}
                  style={{ width: 26, height: 26, borderRadius: 6, background: c, border: edit.color === c ? '3px solid var(--text)' : '1px solid var(--border)' }} />
              ))}
              <input type="color" value={edit.color || '#3e63dd'} onChange={(e) => setEdit({ ...edit, color: e.target.value })} title="Otro color" style={{ width: 34, height: 28, background: 'none', border: 'none', cursor: 'pointer' }} />
              <button type="button" onClick={() => setEdit({ ...edit, color: null })} className="text-xs underline" style={{ color: 'var(--text-muted)' }}>{edit.color ? 'Quitar (automático)' : 'Automático'}</button>
            </div>
          </div>
          <textarea
            value={edit.contenido}
            onChange={(e) => setEdit({ ...edit, contenido: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3 font-mono"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.titulo.trim()) return
                const payload = { titulo: edit.titulo, contenido: edit.contenido, color: edit.color || null, actualizado_por: profile.id, updated_at: new Date().toISOString() }
                const { error } = edit.id ? await supabase.from('massive_formats').update(payload).eq('id', edit.id) : await supabase.from('massive_formats').insert([payload])
                if (error) { alert('No se pudo guardar el formato: ' + error.message + (/color/i.test(error.message) ? '\n\nFalta ejecutar la migración 110 en Supabase.' : '')); return }
                setEdit(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
