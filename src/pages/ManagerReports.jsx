import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { lunesDe, fmtF } from '../lib/excelImport'

const hoy = () => new Date().toISOString().slice(0, 10)
const sumarDias = (isoStr, n) => { const d = new Date(isoStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const TIPOS_W = [
  { id: 'error', n: 'Error corregido', c: 'var(--danger)', i: '🛠' },
  { id: 'observacion', n: 'Observación', c: 'var(--gold)', i: '👁' },
  { id: 'positivo', n: 'Buen trabajo', c: 'var(--success)', i: '👍' },
  { id: 'tarea', n: 'Tarea / supervisión', c: 'var(--accent)', i: '✅' },
]
const TW = Object.fromEntries(TIPOS_W.map((t) => [t.id, t]))
const AMBITOS = [{ id: 'cuentas', n: 'Cuentas' }, { id: 'trabajo', n: 'Trabajo del equipo' }, { id: 'otro', n: 'Otro' }]
const NA = Object.fromEntries(AMBITOS.map((a) => [a.id, a.n]))

const lbl = { color: 'var(--text-muted)' }
function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 72, ...props.style }} />
}
function Chip({ color, children }) {
  return <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{children}</span>
}

export default function ManagerReports() {
  const { profile, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const [pestana, setPestana] = useState('semana') // semana | trabajador
  const [semana, setSemana] = useState(lunesDe(hoy()))
  const [informes, setInformes] = useState([])
  const [wEntries, setWEntries] = useState([])
  const [gEntries, setGEntries] = useState([])
  const [nombres, setNombres] = useState({})
  const [equipo, setEquipo] = useState([])      // trabajadores a los que se puede supervisar
  const [managers, setManagers] = useState([])  // para el admin: quién debería entregar informe
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')

  async function cargar() {
    const [{ data: inf, error: e1 }, ps, team, mgrs] = await Promise.all([
      supabase.from('manager_weekly_reports').select('*').eq('week_start', semana),
      supabase.from('profiles').select('id, full_name'),
      getProfilesByRoles(['chatter', 'ig_assistant', 'ig_manager', 'manager']),
      esAdmin ? getProfilesByRoles(['manager', 'ig_manager']) : Promise.resolve([]),
    ])
    if (e1) { setErr(/manager_weekly_reports/.test(e1.message) ? 'Falta ejecutar la migración 65 en Supabase.' : e1.message); setCargando(false); return }
    setErr('')
    const lista = inf || []
    setInformes(lista)
    setNombres(Object.fromEntries((ps.data || []).map((x) => [x.id, x.full_name])))
    setEquipo(team.filter((x) => x.id !== profile?.id))
    setManagers(mgrs)
    if (lista.length) {
      const ids = lista.map((r) => r.id)
      const [{ data: w }, { data: g }] = await Promise.all([
        supabase.from('manager_report_worker_entries').select('*').in('report_id', ids).order('created_at'),
        supabase.from('manager_report_general_entries').select('*').in('report_id', ids).order('created_at'),
      ])
      setWEntries(w || []); setGEntries(g || [])
    } else { setWEntries([]); setGEntries([]) }
    setCargando(false)
  }
  useEffect(() => { setCargando(true); cargar() }, [semana]) // eslint-disable-line

  const miInforme = informes.find((r) => r.manager_id === profile?.id)
  const esSemanaActual = semana === lunesDe(hoy())
  const nombreDe = (id) => nombres[id] || '—'

  // Los informes que se muestran: el admin ve todos; un manager solo el suyo
  const visibles = esAdmin ? informes : (miInforme ? [miInforme] : [])
  const sinInforme = esAdmin ? managers.filter((m) => !informes.some((r) => r.manager_id === m.id)) : []

  async function crearInforme() {
    const { data, error } = await supabase.from('manager_weekly_reports').insert({ manager_id: profile.id, week_start: semana }).select().single()
    if (error) { setErr(error.message); return null }
    setInformes((l) => [...l, data]); return data
  }
  async function cambiarInforme(r, campos) {
    const { error } = await supabase.from('manager_weekly_reports').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { setErr(error.message); return }
    setInformes((l) => l.map((x) => (x.id === r.id ? { ...x, ...campos } : x)))
  }

  return (
    <div>
      <PageHeader
        title="Informes del manager"
        subtitle={esAdmin ? 'Lo que han supervisado los managers cada semana: errores corregidos y observaciones por trabajador, y las novedades y problemas generales.' : 'Apunta durante la semana lo que supervisas, corriges y observas en cada trabajador, y las novedades o problemas generales. Al terminar, pulsa «Enviar informe».'}
      />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

      <div className="flex gap-2 mb-5 flex-wrap">
        {[['semana', 'Informe de la semana'], ['trabajador', 'Historial por trabajador']].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setPestana(k)} className="px-4 py-2 rounded-md text-sm"
            style={{ background: pestana === k ? 'var(--accent-soft)' : 'var(--panel)', border: `1px solid ${pestana === k ? 'var(--accent)' : 'var(--border)'}`, color: pestana === k ? 'var(--accent)' : 'var(--text)' }}>{t}</button>
        ))}
      </div>

      {pestana === 'trabajador' ? (
        <HistorialTrabajador equipo={equipo} nombres={nombres} esAdmin={esAdmin} profile={profile} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, -7))}>←</Button>
            <strong className="text-sm">Semana del {fmtF(semana)} al {fmtF(sumarDias(semana, 6))}</strong>
            <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, 7))}>→</Button>
            <Button variant="ghost" onClick={() => setSemana(lunesDe(hoy()))} disabled={esSemanaActual}>Esta semana</Button>
          </div>

          {cargando ? <p className="text-sm" style={lbl}>Cargando…</p> : (
            <>
              {!esAdmin && !miInforme && (
                <Panel className="p-6 text-center mb-4">
                  <p className="text-sm mb-3" style={lbl}>Aún no has empezado el informe de esta semana.</p>
                  <Button onClick={crearInforme}>Empezar informe de la semana</Button>
                </Panel>
              )}
              {esAdmin && sinInforme.length > 0 && (
                <Panel className="p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
                  <p className="text-sm"><strong style={{ color: 'var(--gold)' }}>⚠ Sin informe esta semana:</strong> {sinInforme.map((m) => m.full_name).join(', ')}</p>
                </Panel>
              )}
              {esAdmin && visibles.length === 0 && <Panel className="p-6 text-sm text-center" style={lbl}>Ningún manager ha empezado su informe de esta semana.</Panel>}
              {visibles.map((r) => (
                <InformeSemana key={r.id} informe={r} editable={r.manager_id === profile?.id} nombreManager={nombreDe(r.manager_id)} mostrarManager={esAdmin}
                  equipo={equipo} nombres={nombres}
                  wEntries={wEntries.filter((x) => x.report_id === r.id)} gEntries={gEntries.filter((x) => x.report_id === r.id)}
                  setWEntries={setWEntries} setGEntries={setGEntries} onCambio={cambiarInforme} setErr={setErr} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

// =====================================================================================
function InformeSemana({ informe, editable, nombreManager, mostrarManager, equipo, nombres, wEntries, gEntries, setWEntries, setGEntries, onCambio, setErr }) {
  const [wf, setWf] = useState({ worker_id: '', tipo: 'error', texto: '' })
  const [gf, setGf] = useState({ tipo: 'problema', ambito: 'cuentas', texto: '' })
  const [resumen, setResumen] = useState(informe.resumen || '')
  const [editando, setEditando] = useState(null) // { kind, id, texto }
  const enviado = informe.estado === 'enviado'
  const nombreDe = (id) => nombres[id] || '—'

  const porTrabajador = useMemo(() => {
    const m = new Map()
    wEntries.forEach((e) => { if (!m.has(e.worker_id)) m.set(e.worker_id, []); m.get(e.worker_id).push(e) })
    return Array.from(m.entries()).map(([id, items]) => ({ id, items })).sort((a, b) => nombreDe(a.id).localeCompare(nombreDe(b.id), 'es'))
  }, [wEntries, nombres]) // eslint-disable-line

  async function addW() {
    if (!wf.worker_id || !wf.texto.trim()) { setErr('Elige el trabajador y escribe el texto.'); return }
    const { data, error } = await supabase.from('manager_report_worker_entries').insert({ report_id: informe.id, worker_id: wf.worker_id, tipo: wf.tipo, texto: wf.texto.trim() }).select().single()
    if (error) { setErr(error.message); return }
    setErr(''); setWEntries((l) => [...l, data]); setWf({ ...wf, texto: '' })
  }
  async function addG() {
    if (!gf.texto.trim()) { setErr('Escribe el texto.'); return }
    const { data, error } = await supabase.from('manager_report_general_entries').insert({ report_id: informe.id, tipo: gf.tipo, ambito: gf.ambito, texto: gf.texto.trim() }).select().single()
    if (error) { setErr(error.message); return }
    setErr(''); setGEntries((l) => [...l, data]); setGf({ ...gf, texto: '' })
  }
  async function borrar(kind, e) {
    if (!window.confirm('¿Borrar esta anotación?')) return
    const tabla = kind === 'w' ? 'manager_report_worker_entries' : 'manager_report_general_entries'
    const { error } = await supabase.from(tabla).delete().eq('id', e.id)
    if (error) { setErr(error.message); return }
    ;(kind === 'w' ? setWEntries : setGEntries)((l) => l.filter((x) => x.id !== e.id))
  }
  async function guardarEdicion() {
    if (!editando.texto.trim()) return
    const tabla = editando.kind === 'w' ? 'manager_report_worker_entries' : 'manager_report_general_entries'
    const { error } = await supabase.from(tabla).update({ texto: editando.texto.trim() }).eq('id', editando.id)
    if (error) { setErr(error.message); return }
    ;(editando.kind === 'w' ? setWEntries : setGEntries)((l) => l.map((x) => (x.id === editando.id ? { ...x, texto: editando.texto.trim() } : x)))
    setEditando(null)
  }
  async function toggleResuelto(e) {
    const { error } = await supabase.from('manager_report_general_entries').update({ resuelto: !e.resuelto }).eq('id', e.id)
    if (error) { setErr(error.message); return }
    setGEntries((l) => l.map((x) => (x.id === e.id ? { ...x, resuelto: !e.resuelto } : x)))
  }

  const textoInforme = useMemo(() => {
    const L = [`INFORME SEMANAL${mostrarManager ? ' · ' + nombreManager : ''} · semana del ${fmtF(informe.week_start)}`]
    if (informe.resumen?.trim()) L.push('', 'RESUMEN', informe.resumen.trim())
    L.push('', 'SUPERVISIÓN POR TRABAJADOR')
    if (!porTrabajador.length) L.push('(sin anotaciones)')
    porTrabajador.forEach((g) => {
      L.push('', g.items.length ? nombreDe(g.id).toUpperCase() : '')
      g.items.forEach((e) => L.push(`- [${TW[e.tipo]?.n || e.tipo}] ${e.texto}`))
    })
    L.push('', 'NOVEDADES Y PROBLEMAS GENERALES')
    if (!gEntries.length) L.push('(sin anotaciones)')
    gEntries.forEach((e) => L.push(`- [${e.tipo === 'problema' ? 'Problema' : 'Novedad'} · ${NA[e.ambito] || e.ambito}]${e.tipo === 'problema' ? (e.resuelto ? ' (resuelto)' : ' (pendiente)') : ''} ${e.texto}`))
    return L.join('\n') + '\n'
  }, [informe, porTrabajador, gEntries, nombres]) // eslint-disable-line

  const nErr = wEntries.filter((e) => e.tipo === 'error').length
  const nObs = wEntries.filter((e) => e.tipo === 'observacion').length
  const nProb = gEntries.filter((e) => e.tipo === 'problema' && !e.resuelto).length

  function fila(kind, e, children) {
    const ed = editando && editando.id === e.id
    return (
      <div key={e.id} className="flex items-start gap-3 px-3 py-2 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">{children}</div>
          {ed ? (
            <div>
              <Area value={editando.texto} onChange={(ev) => setEditando({ ...editando, texto: ev.target.value })} />
              <div className="flex gap-2 mt-2"><Button onClick={guardarEdicion}>Guardar</Button><Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button></div>
            </div>
          ) : <p className="whitespace-pre-wrap">{e.texto}</p>}
        </div>
        {editable && !ed && (
          <div className="flex gap-3 text-xs whitespace-nowrap">
            <button className="underline" onClick={() => setEditando({ kind, id: e.id, texto: e.texto })}>Editar</button>
            <button className="underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(kind, e)}>Borrar</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Panel className="p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="font-medium">{mostrarManager ? nombreManager : 'Mi informe'} <span className="text-xs font-normal ml-2" style={lbl}>semana del {fmtF(informe.week_start)}</span></p>
          <p className="text-xs mt-1" style={lbl}>{nErr} errores corregidos · {nObs} observaciones · {nProb} problemas pendientes</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {enviado ? <Chip color="var(--success)">✓ Enviado{informe.enviado_at ? ' · ' + new Date(informe.enviado_at).toLocaleDateString('es-ES') : ''}</Chip> : <Chip color="var(--gold)">Borrador</Chip>}
          <CopyButton text={textoInforme} label="Copiar informe" />
          {editable && (enviado
            ? <Button variant="ghost" onClick={() => onCambio(informe, { estado: 'borrador', enviado_at: null })}>Volver a borrador</Button>
            : <Button onClick={() => onCambio(informe, { estado: 'enviado', enviado_at: new Date().toISOString(), resumen })}>Enviar informe</Button>)}
        </div>
      </div>

      {/* Resumen */}
      <div className="mb-6">
        <p className="text-sm font-medium mb-2">Resumen de la semana</p>
        {editable
          ? <Area value={resumen} placeholder="Valoración general de la semana (opcional)…" onChange={(e) => setResumen(e.target.value)} onBlur={() => resumen !== (informe.resumen || '') && onCambio(informe, { resumen })} />
          : <p className="text-sm whitespace-pre-wrap" style={informe.resumen ? undefined : lbl}>{informe.resumen || 'Sin resumen.'}</p>}
      </div>

      {/* Supervisión por trabajador */}
      <p className="text-sm font-medium mb-2">Supervisión por trabajador</p>
      {editable && (
        <div className="rounded-md p-3 mb-3" style={{ border: '1px dashed var(--border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <Select value={wf.worker_id} onChange={(e) => setWf({ ...wf, worker_id: e.target.value })}>
              <option value="">— Trabajador —</option>
              {equipo.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </Select>
            <Select value={wf.tipo} onChange={(e) => setWf({ ...wf, tipo: e.target.value })}>
              {TIPOS_W.map((t) => <option key={t.id} value={t.id}>{t.i} {t.n}</option>)}
            </Select>
          </div>
          <Area value={wf.texto} placeholder={wf.tipo === 'error' ? 'Qué error cometió y cómo lo corregiste…' : wf.tipo === 'observacion' ? 'Qué le has observado / comentado…' : wf.tipo === 'positivo' ? 'Qué ha hecho bien…' : 'Qué tarea o supervisión has hecho con él/ella…'} onChange={(e) => setWf({ ...wf, texto: e.target.value })} />
          <div className="mt-2"><Button onClick={addW}>+ Añadir</Button></div>
        </div>
      )}
      {porTrabajador.length === 0 ? <p className="text-sm mb-6" style={lbl}>Sin anotaciones de trabajadores esta semana.</p> : (
        <div className="space-y-4 mb-6">
          {porTrabajador.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <strong className="text-sm">{nombreDe(g.id)}</strong>
                {TIPOS_W.map((t) => { const n = g.items.filter((e) => e.tipo === t.id).length; return n ? <Chip key={t.id} color={t.c}>{n} {t.n.toLowerCase()}</Chip> : null })}
              </div>
              <div className="space-y-1.5">
                {g.items.map((e) => (
                  fila('w', e, <Chip color={TW[e.tipo]?.c || 'var(--text-muted)'}>{TW[e.tipo]?.i} {TW[e.tipo]?.n || e.tipo}</Chip>)
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Novedades y problemas generales */}
      <p className="text-sm font-medium mb-2">Novedades y problemas generales</p>
      {editable && (
        <div className="rounded-md p-3 mb-3" style={{ border: '1px dashed var(--border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <Select value={gf.tipo} onChange={(e) => setGf({ ...gf, tipo: e.target.value })}>
              <option value="problema">⚠ Problema</option>
              <option value="novedad">📌 Novedad</option>
            </Select>
            <Select value={gf.ambito} onChange={(e) => setGf({ ...gf, ambito: e.target.value })}>
              {AMBITOS.map((a) => <option key={a.id} value={a.id}>{a.n}</option>)}
            </Select>
          </div>
          <Area value={gf.texto} placeholder="Qué ha pasado (cuentas caídas, restricciones, incidencias del equipo, cambios…)" onChange={(e) => setGf({ ...gf, texto: e.target.value })} />
          <div className="mt-2"><Button onClick={addG}>+ Añadir</Button></div>
        </div>
      )}
      {gEntries.length === 0 ? <p className="text-sm" style={lbl}>Sin novedades ni problemas anotados.</p> : (
        <div className="space-y-1.5">
          {gEntries.map((e) => (
            fila('g', e, <>
              <Chip color={e.tipo === 'problema' ? 'var(--danger)' : 'var(--accent)'}>{e.tipo === 'problema' ? '⚠ Problema' : '📌 Novedad'}</Chip>
              <Chip color="var(--text-muted)">{NA[e.ambito] || e.ambito}</Chip>
              {e.tipo === 'problema' && (editable
                ? <button className="text-xs underline" style={{ color: e.resuelto ? 'var(--success)' : 'var(--gold)' }} onClick={() => toggleResuelto(e)}>{e.resuelto ? '✓ Resuelto' : 'Pendiente · marcar resuelto'}</button>
                : <Chip color={e.resuelto ? 'var(--success)' : 'var(--gold)'}>{e.resuelto ? '✓ Resuelto' : 'Pendiente'}</Chip>)}
            </>)
          ))}
        </div>
      )}
    </Panel>
  )
}

// =====================================================================================
// Historial de un trabajador a lo largo de las semanas
function HistorialTrabajador({ equipo, nombres, esAdmin, profile }) {
  const [worker, setWorker] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!worker) { setFilas([]); return }
    setCargando(true)
    supabase.from('manager_report_worker_entries')
      .select('*, manager_weekly_reports(week_start, manager_id)').eq('worker_id', worker).order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => { setFilas(data || []); setCargando(false) })
  }, [worker])

  const lista = filas.filter((f) => tipo === 'todos' || f.tipo === tipo)
    .sort((a, b) => String(b.manager_weekly_reports?.week_start).localeCompare(String(a.manager_weekly_reports?.week_start)))
  const cuenta = (t) => filas.filter((f) => f.tipo === t).length

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-3xl">
        <Select value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">— Elige un trabajador —</option>
          {equipo.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
        </Select>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="todos">Todos los tipos</option>
          {TIPOS_W.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}
        </Select>
      </div>
      {!worker ? <Panel className="p-6 text-sm text-center" style={lbl}>Elige un trabajador para ver todo lo que se le ha corregido y observado, semana a semana.</Panel> : cargando ? <p className="text-sm" style={lbl}>Cargando…</p> : (
        <>
          <div className="flex gap-2 flex-wrap mb-3">{TIPOS_W.map((t) => <Chip key={t.id} color={t.c}>{cuenta(t.id)} {t.n.toLowerCase()}</Chip>)}</div>
          {lista.length === 0 ? <Panel className="p-6 text-sm text-center" style={lbl}>Sin anotaciones.</Panel> : (
            <div className="space-y-1.5">
              {lista.map((f) => (
                <div key={f.id} className="px-3 py-2 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Chip color={TW[f.tipo]?.c || 'var(--text-muted)'}>{TW[f.tipo]?.i} {TW[f.tipo]?.n || f.tipo}</Chip>
                    <span className="text-xs" style={lbl}>Semana del {fmtF(f.manager_weekly_reports?.week_start)}{esAdmin ? ` · ${nombres[f.manager_weekly_reports?.manager_id] || ''}` : ''}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{f.texto}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
