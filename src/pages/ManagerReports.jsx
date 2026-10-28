import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { lunesDe, fmtF } from '../lib/excelImport'

const hoy = () => new Date().toISOString().slice(0, 10)
const sumarDias = (isoStr, n) => { const d = new Date(isoStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const lbl = { color: 'var(--text-muted)' }

// area: 'chatting' (manager de chatting + sus chatters) | 'instagram' (manager de Instagram + sus asistentes)
const AREAS = {
  chatting: { titulo: 'Informes del manager', rolManager: 'manager', rolesEquipo: ['chatter'], quienes: 'chatters', textoManager: 'manager' },
  instagram: { titulo: 'Informes del manager de Instagram', rolManager: 'ig_manager', rolesEquipo: ['ig_assistant'], quienes: 'asistentes de Instagram', textoManager: 'manager de Instagram' },
}

function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 80, ...props.style }} />
}

export default function ManagerReports({ area = 'chatting' }) {
  const cfg = AREAS[area]
  const { profile, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const puedeEscribir = esAdmin || hasRole(cfg.rolManager) // el admin también puede crear sus propios informes
  const [semana, setSemana] = useState(lunesDe(hoy()))
  const [informes, setInformes] = useState([])
  const [nombres, setNombres] = useState({})
  const [equipo, setEquipo] = useState([])
  const [todos, setTodos] = useState([])
  const [managers, setManagers] = useState([])
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')

  async function cargar() {
    const [{ data: inf, error }, ps, team, mgrs, activos] = await Promise.all([
      supabase.from('manager_weekly_reports').select('*').eq('area', area).eq('week_start', semana),
      supabase.from('profiles').select('id, full_name'),
      getProfilesByRoles(cfg.rolesEquipo, { onlyActive: true }),
      esAdmin ? getProfilesByRoles([cfg.rolManager]) : Promise.resolve([]),
      getProfilesByRoles(['chatter', 'ig_assistant', 'manager', 'ig_manager'], { onlyActive: true }),
    ])
    if (error) { setErr(/manager_weekly_reports|area/.test(error.message) ? 'Falta ejecutar la migración 66 en Supabase.' : error.message); setCargando(false); return }
    setErr('')
    setInformes(inf || [])
    setNombres(Object.fromEntries((ps.data || []).map((x) => [x.id, x.full_name])))
    setEquipo(team.filter((x) => x.id !== profile?.id))
    setTodos(activos.filter((x) => x.id !== profile?.id))
    setManagers(mgrs)
    setCargando(false)
  }
  useEffect(() => { setCargando(true); cargar() }, [semana, area]) // eslint-disable-line

  const miInforme = informes.find((r) => r.manager_id === profile?.id)
  const esSemanaActual = semana === lunesDe(hoy())
  const visibles = esAdmin ? informes : (miInforme ? [miInforme] : [])
  const sinInforme = esAdmin ? managers.filter((m) => !informes.some((r) => r.manager_id === m.id)) : []

  async function crearInforme() {
    const supervision = Object.fromEntries(equipo.map((x) => [x.id, '']))
    const { data, error } = await supabase.from('manager_weekly_reports').insert({ manager_id: profile.id, area, week_start: semana, supervision, general: '' }).select().single()
    if (error) { setErr(error.message); return }
    setInformes((l) => [...l, data])
  }

  return (
    <div>
      <PageHeader
        title={cfg.titulo}
        subtitle={esAdmin
          ? `El informe semanal de cada ${cfg.textoManager}: su supervisión de cada trabajador y las observaciones generales de la semana.`
          : `Cada semana, apunta la supervisión de cada trabajador y las observaciones, correcciones e indicaciones generales.`}
      />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, -7))}>←</Button>
        <strong className="text-sm">Semana del {fmtF(semana)} al {fmtF(sumarDias(semana, 6))}</strong>
        <Button variant="ghost" onClick={() => setSemana(sumarDias(semana, 7))}>→</Button>
        <Button variant="ghost" onClick={() => setSemana(lunesDe(hoy()))} disabled={esSemanaActual}>Esta semana</Button>
        {puedeEscribir && !miInforme && !cargando && <Button className="ml-auto" onClick={crearInforme}>+ Añadir informe de la semana</Button>}
      </div>

      {cargando ? <p className="text-sm" style={lbl}>Cargando…</p> : (
        <>
          {esAdmin && sinInforme.length > 0 && (
            <Panel className="p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
              <p className="text-sm"><strong style={{ color: 'var(--gold)' }}>⚠ Sin informe esta semana:</strong> {sinInforme.map((m) => m.full_name).join(', ')}</p>
            </Panel>
          )}
          {visibles.length === 0 && (
            <Panel className="p-6 text-sm text-center" style={lbl}>
              {esAdmin ? 'Todavía no hay informes esta semana. Puedes crear el tuyo con «+ Añadir informe de la semana».' : puedeEscribir ? 'Aún no has añadido el informe de esta semana. Pulsa «+ Añadir informe de la semana».' : 'No hay informe esta semana.'}
            </Panel>
          )}
          {visibles.map((r) => (
            <Informe key={r.id} informe={r} editable={r.manager_id === profile?.id && puedeEscribir} mostrarManager={esAdmin}
              nombreManager={nombres[r.manager_id] || '—'} equipo={equipo} todos={todos} nombres={nombres} quienes={cfg.quienes} setErr={setErr}
              onGuardado={(nuevo) => setInformes((l) => l.map((x) => (x.id === nuevo.id ? { ...x, ...nuevo } : x)))} />
          ))}
        </>
      )}
    </div>
  )
}

function Informe({ informe, editable, mostrarManager, nombreManager, equipo, todos, nombres, quienes, setErr, onGuardado }) {
  const [sup, setSup] = useState(informe.supervision || {})
  const [general, setGeneral] = useState(informe.general || '')
  const [extra, setExtra] = useState([]) // trabajadores añadidos a mano en esta sesión
  const [elegir, setElegir] = useState('')
  const [estado, setEstado] = useState('') // '' | 'sin guardar' | 'guardando' | 'guardado'
  const nombreDe = (id) => nombres[id] || '—'

  // Cajas: los trabajadores del equipo + los que ya tenían texto + los añadidos a mano
  const ids = useMemo(() => {
    const set = new Set([...equipo.map((x) => x.id), ...Object.keys(informe.supervision || {}), ...extra])
    return Array.from(set).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'))
  }, [equipo, informe.supervision, extra, nombres]) // eslint-disable-line
  const candidatos = todos.filter((x) => !ids.includes(x.id))

  async function guardar(nuevaSup = sup, nuevoGeneral = general) {
    setEstado('guardando')
    const payload = { supervision: nuevaSup, general: nuevoGeneral, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('manager_weekly_reports').update(payload).eq('id', informe.id)
    if (error) { setErr(error.message); setEstado('sin guardar'); return }
    setErr(''); setEstado('guardado'); onGuardado({ id: informe.id, ...payload })
  }
  const cambiado = JSON.stringify(sup) !== JSON.stringify(informe.supervision || {}) || general !== (informe.general || '')

  const texto = useMemo(() => {
    const L = [`INFORME SEMANAL${mostrarManager ? ' · ' + nombreManager : ''} · semana del ${fmtF(informe.week_start)}`, '', 'SUPERVISIÓN POR TRABAJADOR']
    ids.forEach((id) => { if ((informe.supervision?.[id] || '').trim()) L.push('', nombreDe(id).toUpperCase(), informe.supervision[id].trim()) })
    L.push('', 'OBSERVACIONES, CORRECCIONES E INDICACIONES GENERALES', (informe.general || '').trim() || '(sin anotaciones)')
    return L.join('\n') + '\n'
  }, [informe, ids, nombres]) // eslint-disable-line

  return (
    <Panel className="p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="font-medium">{mostrarManager && !editable ? nombreManager : 'Mi informe'} <span className="text-xs font-normal ml-2" style={lbl}>semana del {fmtF(informe.week_start)}</span></p>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && <span className="text-xs" style={{ color: estado === 'guardado' && !cambiado ? 'var(--success)' : cambiado ? 'var(--gold)' : 'var(--text-muted)' }}>{estado === 'guardando' ? 'Guardando…' : cambiado ? 'Cambios sin guardar' : estado === 'guardado' ? '✓ Guardado' : ''}</span>}
          <CopyButton text={texto} label="Copiar informe" />
          {editable && <Button onClick={() => guardar()} disabled={!cambiado || estado === 'guardando'}>Guardar informe</Button>}
        </div>
      </div>

      <p className="text-sm font-medium mb-2">Supervisión por trabajador</p>
      {ids.length === 0 && <p className="text-sm mb-3" style={lbl}>No hay {quienes} activos. Añade uno a mano abajo.</p>}
      <div className="space-y-3 mb-3">
        {ids.map((id) => (
          <div key={id}>
            <label className="text-xs font-medium block mb-1">{nombreDe(id)}</label>
            {editable
              ? <Area value={sup[id] || ''} placeholder="Errores corregidos, observaciones, cómo ha trabajado…" onChange={(e) => setSup({ ...sup, [id]: e.target.value })} onBlur={() => cambiado && guardar()} />
              : <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', ...(informe.supervision?.[id] ? {} : lbl) }}>{informe.supervision?.[id] || 'Sin anotaciones.'}</p>}
          </div>
        ))}
      </div>
      {editable && candidatos.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <div className="min-w-[220px]">
            <Select value={elegir} onChange={(e) => setElegir(e.target.value)}>
              <option value="">— Añadir otro trabajador —</option>
              {candidatos.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </Select>
          </div>
          <Button variant="ghost" disabled={!elegir} onClick={() => { setExtra((l) => [...l, elegir]); setSup((s) => ({ ...s, [elegir]: s[elegir] || '' })); setElegir('') }}>+ Añadir</Button>
        </div>
      )}
      {!editable && <div className="mb-6" />}

      <p className="text-sm font-medium mb-2">Observaciones, correcciones e indicaciones generales de la semana</p>
      {editable
        ? <Area value={general} style={{ minHeight: 180 }} placeholder="Novedades y problemas con las cuentas o con el trabajo del equipo, correcciones generales, indicaciones…" onChange={(e) => setGeneral(e.target.value)} onBlur={() => cambiado && guardar()} />
        : <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', ...(informe.general ? {} : lbl) }}>{informe.general || 'Sin anotaciones.'}</p>}
    </Panel>
  )
}
