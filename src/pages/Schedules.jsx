import { useEffect, useMemo, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles, getExtrabajadorIds } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { ModelAvatar } from '../components/ModelAvatar'
import { horarioTurno } from '../lib/horasTurno'

const TURNOS = [
  { id: 'noche', n: 'Mañana', h: horarioTurno('noche') },
  { id: 'mañana', n: 'Tarde', h: horarioTurno('mañana') },
  { id: 'tarde', n: 'Noche', h: horarioTurno('tarde') },
]
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function mondayOf(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function fmtFecha(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function fechaHoyISO() { return isoDate(new Date()) }

export default function Schedules() {
  const { hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [tab, setTab] = useState('sem')

  return (
    <div>
      <PageHeader title="Horarios" subtitle="Asignación semanal de chatters por turno y grupo de modelos." />
      <div className="flex gap-2 mb-5">
        {[['sem', 'Semana'], ['grp', 'Grupos de modelos']].map(([id, label]) => (
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
      {tab === 'sem' ? <HorarioSemana esMgr={esMgr} /> : <Grupos esMgr={esMgr} />}
    </div>
  )
}

function HorarioSemana({ esMgr }) {
  const { profile } = useAuth()
  const [lunes, setLunes] = useState(() => mondayOf(new Date()))
  const [rows, setRows] = useState([])
  const [chatters, setChatters] = useState([])
  const [grupos, setGrupos] = useState([])
  const [add, setAdd] = useState(null)
  const [reps, setReps] = useState([])

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(lunes, i)), [lunes])

  async function load() {
    const desde = isoDate(dias[0]), hasta = isoDate(dias[6])
    try { await supabase.rpc('materializar_repeticiones', { p_desde: desde, p_hasta: hasta }) } catch (e) { /* migración 131 aún sin ejecutar */ }
    const [{ data: r }, u, { data: g }, ex, { data: rp }] = await Promise.all([
      supabase.from('schedules').select('*, profiles(full_name)').gte('fecha', desde).lte('fecha', hasta),
      getProfilesByRoles(['manager', 'chatter']),
      supabase.from('shift_groups').select('id, nombre, modelos').eq('activo', true).order('nombre'),
      getExtrabajadorIds(),
      supabase.from('schedule_repeticiones').select('*').eq('activo', true).order('desde'),
    ])
    setRows((r || []).filter((x) => !ex.has(x.chatter_id)).map((x) => (x.turno === 'madrugada' ? { ...x, turno: 'noche' } : x))); setChatters(u); setGrupos(g || []); setReps(rp || [])
  }
  useEffect(() => { load() }, [lunes])

  async function borrar(h) {
    if (h.repeticion_id) await supabase.rpc('excluir_dia_repeticion', { p_id: h.repeticion_id, p_fecha: h.fecha })
    else await supabase.from('schedules').delete().eq('id', h.id)
    setRows((rs) => rs.filter((x) => x.id !== h.id))
  }

  const byKey = useMemo(() => {
    const g = {}
    for (const r of rows) { const k = r.fecha + '|' + r.turno; (g[k] = g[k] || []).push(r) }
    return g
  }, [rows])
  const hoy = fechaHoyISO()

  // Resumen por chatter de la semana mostrada: días, nº de días y modelos (según el grupo asignado)
  const resumen = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const c = (m[r.chatter_id] = m[r.chatter_id] || { nombre: r.profiles?.full_name || '—', fechas: new Set(), grupos: new Set(), modelos: [] })
      c.fechas.add(r.fecha)
      const g = grupos.find((x) => x.id === r.grupo_id)
      if (g) { c.grupos.add(g.nombre); for (const n of aLista(g.modelos)) if (!c.modelos.some((y) => normN(y) === normN(n))) c.modelos.push(n) }
    }
    return Object.values(m).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => ({
      ...c,
      dias: [...c.fechas].sort().map((f) => DIAS[(new Date(f + 'T12:00:00').getDay() + 6) % 7].slice(0, 3)),
    }))
  }, [rows, grupos])

  async function detener(rp) {
    if (!confirm('¿Detener esta repetición desde hoy? Se borran los turnos futuros que generó.')) return
    await supabase.rpc('detener_repeticion', { p_id: rp.id, p_desde: hoy > rp.desde ? hoy : rp.desde })
    load()
  }

  return (
    <div>
      <Panel className="p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setLunes(addDays(lunes, -7))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>‹</button>
          <strong className="min-w-[180px] text-center text-sm">{fmtFecha(isoDate(dias[0]))} – {fmtFecha(isoDate(dias[6]))}</strong>
          <button onClick={() => setLunes(addDays(lunes, 7))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>›</button>
          <Button variant="ghost" onClick={() => setLunes(mondayOf(new Date()))}>Hoy</Button>
        </div>
        <div className="overflow-x-auto">
          <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, minmax(120px, 1fr))', gap: 4 }}>
            <div />
            {dias.map((d, i) => (
              <div key={i} className="text-xs text-center py-1" style={{ color: 'var(--text-muted)' }}>
                {DIAS[i].slice(0, 3)}<br />{d.getDate()}/{d.getMonth() + 1}
              </div>
            ))}
            {TURNOS.map((t) => (
              <Fragment key={t.id}>
                <div className="text-xs py-2 pr-2" style={{ color: 'var(--text-muted)' }}>
                  {t.n}<br /><span style={{ fontSize: 10 }}>{t.h}</span>
                </div>
                {dias.map((d, i) => {
                  const iso = isoDate(d); const k = iso + '|' + t.id; const cell = byKey[k] || []
                  return (
                    <div
                      key={i}
                      className="rounded-md p-1 min-h-[52px]"
                      style={{ background: iso === hoy ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)' }}
                    >
                      {cell.map((h) => (
                        <div key={h.id} className="text-xs rounded px-1.5 py-1 mb-1 flex justify-between items-center" style={{ background: 'var(--panel)' }}>
                          <span>
                            <strong>{h.profiles?.full_name}</strong>
                            {h.grupo_id ? <span style={{ color: 'var(--text-muted)' }}> · {grupos.find((g) => g.id === h.grupo_id)?.nombre}</span> : null}
                          </span>
                          {esMgr && <span onClick={() => borrar(h)} className="cursor-pointer" style={{ color: 'var(--danger)' }}>✕</span>}
                        </div>
                      ))}
                      {esMgr && (
                        <button
                          onClick={() => setAdd({ fecha: iso, turno: t.id, chatter_id: chatters[0]?.id || '', grupo_id: '' })}
                          className="text-xs w-full text-left opacity-60 hover:opacity-100"
                          style={{ color: 'var(--accent)' }}
                        >
                          + asignar
                        </button>
                      )}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="p-5 mb-4">
        <p className="text-sm font-medium mb-3">Resumen de la semana por chatter</p>
        {resumen.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nadie asignado esta semana.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1 pr-3 font-normal">Chatter</th><th className="py-1 pr-3 font-normal">Días que trabaja</th>
                  <th className="py-1 pr-3 font-normal">Nº de días</th><th className="py-1 font-normal">Modelos asignadas</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((c) => (
                  <tr key={c.nombre} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2 pr-3 font-medium">{c.nombre}</td>
                    <td className="py-2 pr-3">{c.dias.join(', ')}</td>
                    <td className="py-2 pr-3">{c.dias.length}</td>
                    <td className="py-2" style={{ color: c.modelos.length ? 'var(--text)' : 'var(--text-muted)' }}>
                      {c.modelos.length ? c.modelos.join(', ') : 'Sin grupo asignado'}
                      {c.grupos.size > 0 && <span style={{ color: 'var(--text-muted)' }}> · {[...c.grupos].join(', ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {esMgr && reps.length > 0 && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">Repeticiones activas</p>
          {reps.map((rp) => (
            <div key={rp.id} className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
              <span>
                <strong>{chatters.find((c) => c.id === rp.chatter_id)?.full_name || 'Chatter'}</strong> · {TURNOS.find((t) => t.id === rp.turno)?.n} · {rp.dias.map((d) => DIAS[d].slice(0, 3)).join(', ')} ·{' '}
                desde {fmtFecha(rp.desde)} {rp.hasta ? `hasta ${fmtFecha(rp.hasta)}` : '· indefinidamente'}
              </span>
              <button onClick={() => detener(rp)} className="hover:underline" style={{ color: 'var(--danger)' }}>Detener</button>
            </div>
          ))}
        </Panel>
      )}

      {add && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">Asignar turno</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input type="date" value={add.fecha} onChange={(e) => setAdd({ ...add, fecha: e.target.value })} />
            <Select value={add.turno} onChange={(e) => setAdd({ ...add, turno: e.target.value })}>
              {TURNOS.map((t) => <option key={t.id} value={t.id}>{t.n} ({t.h})</option>)}
            </Select>
            <Select value={add.chatter_id} onChange={(e) => setAdd({ ...add, chatter_id: e.target.value })}>
              {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
            <Select value={add.grupo_id} onChange={(e) => setAdd({ ...add, grupo_id: e.target.value })}>
              <option value="">— sin grupo —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
            <input type="checkbox" checked={!!add.repetir} onChange={(e) => setAdd({ ...add, repetir: e.target.checked, dias: add.dias || [(new Date(add.fecha + 'T12:00:00').getDay() + 6) % 7], fin: add.fin || 'fecha' })} />
            Repetir este horario cada semana
          </label>
          {add.repetir && (
            <div className="mb-3 p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Días de la semana en los que se repite</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {DIAS.map((d, i) => {
                  const on = (add.dias || []).includes(i)
                  return (
                    <button key={d} type="button" onClick={() => setAdd({ ...add, dias: on ? add.dias.filter((x) => x !== i) : [...add.dias, i] })}
                      className="px-2.5 py-1 rounded-full text-xs"
                      style={{ background: on ? 'var(--accent-soft)' : 'var(--panel)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}>
                      {d.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>¿Hasta cuándo?</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={add.fin !== 'siempre'} onChange={() => setAdd({ ...add, fin: 'fecha' })} /> Hasta una fecha</label>
                {add.fin !== 'siempre' && <Input type="date" value={add.hasta || ''} min={add.fecha} onChange={(e) => setAdd({ ...add, hasta: e.target.value })} />}
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={add.fin === 'siempre'} onChange={() => setAdd({ ...add, fin: 'siempre' })} /> Indefinidamente</label>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!add.chatter_id) return
                const { repetir, dias: dsel, fin, hasta, ...base } = add
                if (repetir) {
                  if (!dsel?.length) return alert('Elige al menos un día de la semana')
                  if (fin !== 'siempre' && !hasta) return alert('Elige hasta qué fecha se repite, o marca «Indefinidamente»')
                  const { error } = await supabase.from('schedule_repeticiones').insert([{
                    chatter_id: base.chatter_id, turno: base.turno, grupo_id: base.grupo_id || null,
                    dias: dsel, desde: base.fecha, hasta: fin === 'siempre' ? null : hasta, creado_por: profile.id,
                  }])
                  if (error) return alert('No se pudo guardar la repetición: ' + error.message)
                } else {
                  await supabase.from('schedules').insert([{ ...base, grupo_id: base.grupo_id || null, creado_por: profile.id }])
                }
                setAdd(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setAdd(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

// El campo `modelos` del grupo es texto («Alicia, Violeta, Valen»). Se convierte a lista y de vuelta.
const aLista = (txt) => String(txt || '').split(/[,\n]+/).map((x) => x.trim()).filter(Boolean)
const normN = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function SelectorModelos({ modelos, value, onChange }) {
  const [q, setQ] = useState('')
  const elegidas = aLista(value)
  const enCRM = new Set(modelos.map((m) => normN(m.stage_name)))
  const sueltas = elegidas.filter((n) => !enCRM.has(normN(n))) // nombres antiguos que ya no coinciden con ninguna modelo del CRM
  const estaOn = (nombre) => elegidas.some((n) => normN(n) === normN(nombre))
  function alternar(nombre) {
    const nuevo = estaOn(nombre) ? elegidas.filter((n) => normN(n) !== normN(nombre)) : elegidas.concat([nombre])
    onChange(nuevo.join(', '))
  }
  const visibles = modelos.filter((m) => !q.trim() || normN(m.stage_name).includes(normN(q)))
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Modelos del grupo · {elegidas.length} seleccionada{elegidas.length === 1 ? '' : 's'}</p>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar modelo…"
          className="px-3 py-1 rounded-md text-xs outline-none"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', width: 160 }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {visibles.map((m) => {
          const on = estaOn(m.stage_name)
          return (
            <button
              key={m.id} type="button" onClick={() => alternar(m.stage_name)}
              className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
            >
              <ModelAvatar name={m.stage_name} size={26} />
              {on ? '✓ ' : ''}{m.stage_name}
            </button>
          )
        })}
        {visibles.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ninguna modelo coincide.</p>}
      </div>
      {sueltas.length > 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--gold)' }}>
          Estos nombres no coinciden con ninguna modelo del CRM: {sueltas.join(', ')}.{' '}
          <button type="button" className="underline" onClick={() => onChange(elegidas.filter((n) => enCRM.has(normN(n))).join(', '))}>Quitarlos</button>
        </p>
      )}
    </div>
  )
}

function Grupos({ esMgr }) {
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)
  const [errNombre, setErrNombre] = useState(false)
  const [modelos, setModelos] = useState([])

  async function load() {
    const [{ data }, { data: md }] = await Promise.all([
      supabase.from('shift_groups').select('*').order('esquema').order('nombre'),
      supabase.from('models').select('id, stage_name, status').order('stage_name'),
    ])
    setRows(data || [])
    setModelos((md || []).filter((m) => m.status !== 'baja'))
  }
  useEffect(() => { load() }, [])

  async function borrar(g) {
    if (!confirm(`¿Eliminar el grupo "${g.nombre}"?`)) return
    await supabase.from('shift_groups').delete().eq('id', g.id)
    load()
  }

  return (
    <div>
      {esMgr && (
        <Button className="mb-4" onClick={() => { setErrNombre(false); setEdit({ nombre: '', modelos: '' }) }}>+ Nuevo grupo</Button>
      )}
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin grupos todavía</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {[...rows].sort((x, y) => x.nombre.localeCompare(y.nombre)).map((g) => (
            <Panel key={g.id} className="p-4">
              <p className="font-medium mb-1">{g.nombre}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
                {aLista(g.modelos).map((n) => (
                  <span key={n} className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <ModelAvatar name={modelos.find((m) => normN(m.stage_name) === normN(n))?.stage_name || n} size={22} />{n}
                  </span>
                ))}
              </div>
              {esMgr && (
                <div className="flex gap-2">
                  <button onClick={() => setEdit({ ...g })} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
                  <button onClick={() => borrar(g)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar grupo' : 'Nuevo grupo'}</p>
          <div className="mb-3">
            <Input placeholder="Nombre del grupo" value={edit.nombre} onChange={(e) => { setErrNombre(false); setEdit({ ...edit, nombre: e.target.value }) }} style={errNombre ? { borderColor: 'var(--danger)' } : undefined} />
            {errNombre && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Falta poner el nombre del grupo.</p>}
          </div>
          <SelectorModelos modelos={modelos} value={edit.modelos} onChange={(v) => setEdit({ ...edit, modelos: v })} />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.nombre.trim()) { setErrNombre(true); return }
                const payload = { nombre: edit.nombre.trim(), modelos: edit.modelos }
                if (edit.id) await supabase.from('shift_groups').update(payload).eq('id', edit.id)
                else await supabase.from('shift_groups').insert([{ ...payload, esquema: 'General', activo: true }])
                setEdit(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => { setEdit(null); setErrNombre(false) }}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
