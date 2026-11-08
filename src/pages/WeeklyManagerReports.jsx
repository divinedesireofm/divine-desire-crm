import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, Table, Td, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { lunesDe, fmtF, iso, aFecha } from '../lib/excelImport'

const lbl = { color: 'var(--text-muted)' }
const caja = { background: 'var(--panel-alt)', border: '1px solid var(--border)' }

// Fechas en hora local (no UTC): un manager en Venezuela que escribe el domingo por la noche
// no debe acabar con el informe de la semana siguiente.
const hoy = () => iso(new Date())
const sumarDias = (isoStr, n) => { const d = aFecha(isoStr); d.setDate(d.getDate() + n); return iso(d) }

// area: 'chatting' (manager de chatting + sus chatters) | 'instagram' (manager de Instagram + sus asistentes)
const AREAS = {
  chatting: { titulo: 'Informes semanales del manager', rolManager: 'manager', rolesEquipo: ['chatter'], singular: 'chatter', plural: 'chatters' },
  instagram: { titulo: 'Informes semanales del manager de Instagram', rolManager: 'ig_manager', rolesEquipo: ['ig_assistant'], singular: 'asistente', plural: 'asistentes de Instagram' },
}

const vacio = (s) => !(s || '').trim()
const registrado = (r) => r.created_at || r.updated_at

function fmtFechaHora(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function resumen(s, n = 90) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t
}
const esEditado = (r) => !!(r.created_at && r.updated_at && new Date(r.updated_at) - new Date(r.created_at) > 60000)
const notasConTexto = (r) => Object.values(r.supervision || {}).filter((t) => !vacio(t)).length
const rangoSemana = (semana) => `${fmtF(semana)} → ${fmtF(sumarDias(semana, 6))}`

function traducirError(e) {
  const m = e?.message || ''
  if (e?.code === '23505') return 'Ya hay un informe tuyo de esa semana. Ábrelo desde la lista y pulsa «Editar».'
  if (/sugerencias|created_at|schema cache/i.test(m)) return 'Falta ejecutar el archivo «informes-manager-sugerencias.sql» en Supabase (SQL Editor).'
  return m || 'No se pudo guardar el informe.'
}

function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ ...caja, color: 'var(--text)', minHeight: 90, ...props.style }} />
}
function TextoLeido({ texto }) {
  return <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={{ ...caja, ...(vacio(texto) ? lbl : {}) }}>{vacio(texto) ? 'Sin anotaciones.' : texto}</p>
}

export default function WeeklyManagerReports({ area = 'chatting' }) {
  const cfg = AREAS[area]
  const { profile, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const puedeEscribir = esAdmin || hasRole(cfg.rolManager) // el admin también puede crear sus propios informes
  const [vista, setVista] = useState('lista') // 'lista' | 'nuevo' | 'ver' | 'editar'
  const [seleccion, setSeleccion] = useState(null)
  const [informes, setInformes] = useState([])
  const [nombres, setNombres] = useState({})
  const [equipo, setEquipo] = useState([]) // trabajadores activos (menos uno mismo)
  const [todos, setTodos] = useState([]) // todos los de esta área, para añadir a mano (p. ej. inactivos)
  const [managers, setManagers] = useState([])
  const [filtro, setFiltro] = useState('')
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')

  async function cargar() {
    const [{ data: inf, error }, ps, team, activos, mgrs] = await Promise.all([
      supabase.from('manager_weekly_reports').select('*').eq('area', area).order('created_at', { ascending: false }).limit(300),
      supabase.from('profiles').select('id, full_name'),
      getProfilesByRoles(cfg.rolesEquipo, { onlyActive: true }),
      getProfilesByRoles(cfg.rolesEquipo),
      esAdmin ? getProfilesByRoles([cfg.rolManager], { onlyActive: true }) : Promise.resolve([]),
    ])
    if (error) {
      setErr(/manager_weekly_reports|area/.test(error.message) && !/created_at/.test(error.message) ? 'Falta ejecutar la migración de los informes del manager en Supabase.' : traducirError(error))
      setCargando(false)
      return
    }
    setErr('')
    setInformes(inf || [])
    setNombres(Object.fromEntries((ps.data || []).map((x) => [x.id, x.full_name])))
    setEquipo(team.filter((x) => x.id !== profile?.id))
    setTodos(activos.filter((x) => x.id !== profile?.id))
    setManagers(mgrs)
    setCargando(false)
  }
  useEffect(() => { setCargando(true); cargar() }, [area]) // eslint-disable-line

  const nombreDe = (id) => nombres[id] || '—'
  const propios = informes.filter((r) => r.manager_id === profile?.id)
  const semanaActual = lunesDe(hoy())
  const visibles = useMemo(() => {
    const base = esAdmin ? informes : informes.filter((r) => r.manager_id === profile?.id)
    return base
      .filter((r) => !filtro || r.manager_id === filtro)
      .sort((a, b) => new Date(registrado(b) || 0) - new Date(registrado(a) || 0))
  }, [informes, esAdmin, filtro, profile?.id])
  const managersEnLista = useMemo(() => Array.from(new Set(informes.map((r) => r.manager_id))).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es')), [informes, nombres]) // eslint-disable-line
  const sinInforme = esAdmin ? managers.filter((m) => !informes.some((r) => r.manager_id === m.id && r.week_start === semanaActual)) : []
  const informeSel = informes.find((r) => r.id === seleccion)

  async function guardar({ id, semana, general, sugerencias, supervision }) {
    const base = { general, sugerencias, supervision }
    if (id) {
      const { data, error } = await supabase.from('manager_weekly_reports').update({ ...base, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) return traducirError(error)
      setInformes((l) => l.map((x) => (x.id === id ? { ...x, ...data } : x)))
      setSeleccion(id); setVista('ver')
      return ''
    }
    const { data, error } = await supabase.from('manager_weekly_reports').insert({ manager_id: profile.id, area, week_start: semana, ...base }).select().single()
    if (error) return traducirError(error)
    setInformes((l) => [data, ...l])
    setSeleccion(data.id); setVista('ver')
    return ''
  }

  if (vista === 'nuevo' || (vista === 'editar' && informeSel)) {
    return (
      <div>
        <PageHeader title={vista === 'nuevo' ? 'Nuevo informe semanal' : 'Editar informe'} subtitle={vista === 'nuevo' ? 'Rellena la plantilla y pulsa «Enviar informe». Lo verá la dirección en la lista de informes.' : `Informe de la semana del ${rangoSemana(informeSel.week_start)}`} />
        <FormularioInforme
          modo={vista} inicial={vista === 'editar' ? informeSel : null} cfg={cfg} area={area} userId={profile?.id}
          equipo={equipo} todos={todos} nombres={nombres} semanasOcupadas={propios.map((r) => r.week_start)}
          onCancelar={() => setVista(vista === 'editar' ? 'ver' : 'lista')} onGuardar={guardar} />
      </div>
    )
  }

  if (vista === 'ver' && informeSel) {
    const esMio = informeSel.manager_id === profile?.id
    return (
      <div>
        <PageHeader title="Informe semanal" subtitle={`Semana del ${rangoSemana(informeSel.week_start)}`} />
        <DetalleInforme informe={informeSel} cfg={cfg} nombres={nombres} esMio={esMio} puedeEditar={esMio && puedeEscribir}
          onVolver={() => setVista('lista')} onEditar={() => setVista('editar')} />
      </div>
    )
  }

  const columnas = esAdmin
    ? ['Fecha y hora', 'Semana', 'Manager', 'Observaciones generales', `Notas de ${cfg.plural}`, 'Sugerencias', '']
    : ['Fecha y hora', 'Semana', 'Observaciones generales', `Notas de ${cfg.plural}`, 'Sugerencias', '']

  return (
    <div>
      <PageHeader
        title={cfg.titulo}
        subtitle={esAdmin ? 'Todos los informes que han enviado los managers, del más reciente al más antiguo.' : 'Tus informes semanales, del más reciente al más antiguo.'}
        action={puedeEscribir && !cargando && !err ? <Button onClick={() => setVista('nuevo')}>+ Nuevo informe</Button> : null}
      />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

      {!cargando && !err && esAdmin && sinInforme.length > 0 && (
        <Panel className="p-4 mb-4" style={{ borderColor: 'var(--gold)' }}>
          <p className="text-sm"><strong style={{ color: 'var(--gold)' }}>⚠ Sin informe de esta semana:</strong> {sinInforme.map((m) => m.full_name).join(', ')}</p>
        </Panel>
      )}

      {esAdmin && managersEnLista.length > 1 && (
        <div className="mb-4 max-w-xs">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos los managers</option>
            {managersEnLista.map((id) => <option key={id} value={id}>{nombreDe(id)}</option>)}
          </Select>
        </div>
      )}

      {cargando ? <p className="text-sm" style={lbl}>Cargando…</p> : err ? null : visibles.length === 0 ? (
        <Panel className="p-6 text-sm text-center" style={lbl}>
          {puedeEscribir ? 'Todavía no hay informes. Pulsa «+ Nuevo informe» para crear el primero.' : 'Todavía no hay informes.'}
        </Panel>
      ) : (
        <Panel>
          <Table
            columns={columnas}
            rows={visibles}
            renderRow={(r) => (
              <>
                <Td>
                  <span className="whitespace-nowrap">{fmtFechaHora(registrado(r))}</span>
                  {esEditado(r) && <span className="block text-xs" style={lbl}>editado {fmtFechaHora(r.updated_at)}</span>}
                </Td>
                <Td><span className="whitespace-nowrap">{rangoSemana(r.week_start)}</span></Td>
                {esAdmin && <Td>{nombreDe(r.manager_id)}{r.manager_id === profile?.id ? ' (tú)' : ''}</Td>}
                <Td><span className="block max-w-xs" style={vacio(r.general) ? lbl : undefined}>{resumen(r.general) || '—'}</span></Td>
                <Td>{notasConTexto(r)} de {Object.keys(r.supervision || {}).length}</Td>
                <Td>{vacio(r.sugerencias) ? <span style={lbl}>—</span> : 'Sí'}</Td>
                <Td><Button variant="ghost" onClick={() => { setSeleccion(r.id); setVista('ver') }}>Abrir</Button></Td>
              </>
            )}
          />
        </Panel>
      )}
    </div>
  )
}

function FormularioInforme({ modo, inicial, cfg, area, userId, equipo, todos, nombres, semanasOcupadas, onCancelar, onGuardar }) {
  const editando = modo === 'editar'
  const claveBorrador = `informe-manager-borrador:${area}:${userId}`
  const borrador = useMemo(() => {
    if (editando) return null
    try { return JSON.parse(localStorage.getItem(claveBorrador) || 'null') } catch { return null }
  }, []) // eslint-disable-line
  const [semana, setSemana] = useState(editando ? inicial.week_start : (borrador?.semana || lunesDe(hoy())))
  const [general, setGeneral] = useState(editando ? (inicial.general || '') : (borrador?.general || ''))
  const [sugerencias, setSugerencias] = useState(editando ? (inicial.sugerencias || '') : (borrador?.sugerencias || ''))
  const [sup, setSup] = useState(editando ? { ...(inicial.supervision || {}) } : (borrador?.sup || {}))
  const [extra, setExtra] = useState(borrador?.extra || []) // trabajadores añadidos a mano
  const [elegir, setElegir] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const nombreDe = (id) => nombres[id] || '—'

  // Cajas: al crear, todo el equipo activo; al editar un informe, solo quienes ya estaban en él. Más los añadidos a mano.
  const ids = useMemo(() => {
    const base = editando ? [] : equipo.map((x) => x.id)
    const set = new Set([...base, ...Object.keys(sup), ...extra])
    return Array.from(set).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'))
  }, [editando, equipo, sup, extra, nombres]) // eslint-disable-line
  const candidatos = todos.filter((x) => !ids.includes(x.id))
  const hayTexto = !vacio(general) || !vacio(sugerencias) || ids.some((id) => !vacio(sup[id]))
  const semanaOcupada = !editando && semanasOcupadas.includes(semana)

  // Borrador local (solo al crear): si se cierra la pestaña o se recarga, no se pierde lo escrito.
  useEffect(() => {
    if (editando) return
    try {
      if (hayTexto) localStorage.setItem(claveBorrador, JSON.stringify({ semana, general, sugerencias, sup, extra }))
      else localStorage.removeItem(claveBorrador)
    } catch { /* sin almacenamiento local: no pasa nada */ }
  }, [semana, general, sugerencias, sup, extra]) // eslint-disable-line

  function vaciarBorrador() {
    if (!window.confirm('¿Vaciar el borrador? Se borra todo lo que has escrito en este informe.')) return
    setGeneral(''); setSugerencias(''); setSup({}); setExtra([]); setError('')
  }
  function cancelar() {
    const cambiado = general !== (inicial?.general || '') || sugerencias !== (inicial?.sugerencias || '') || JSON.stringify(sup) !== JSON.stringify(inicial?.supervision || {})
    if (editando && cambiado && !window.confirm('¿Salir sin guardar? Los cambios de este informe se perderán.')) return
    onCancelar()
  }
  async function enviar() {
    if (!hayTexto) { setError('Escribe algo en el informe antes de enviarlo.'); return }
    setEnviando(true); setError('')
    const supervision = Object.fromEntries(ids.map((id) => [id, (sup[id] || '').trim()]))
    const msg = await onGuardar({ id: editando ? inicial.id : null, semana, general: general.trim(), sugerencias: sugerencias.trim(), supervision })
    if (msg) { setError(msg); setEnviando(false); return }
    if (!editando) { try { localStorage.removeItem(claveBorrador) } catch { /* nada */ } }
  }

  return (
    <Panel className="p-5">
      <div className="mb-5">
        <label htmlFor="inf-semana" className="text-sm font-medium block mb-1">Semana del informe</label>
        {editando
          ? <p className="text-sm">Semana del {rangoSemana(semana)}</p>
          : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-44"><Input id="inf-semana" type="date" value={semana} onChange={(e) => { if (e.target.value) setSemana(lunesDe(e.target.value)) }} /></div>
              <span className="text-sm" style={lbl}>Semana del {rangoSemana(semana)} (lunes a domingo)</span>
            </div>
          )}
        {semanaOcupada && <p className="text-sm mt-2" style={{ color: 'var(--gold)' }}>Ya tienes un informe de esa semana. Ábrelo desde la lista y pulsa «Editar», o elige otra semana.</p>}
      </div>

      <label htmlFor="inf-general" className="text-sm font-medium block mb-1">Observaciones generales de la semana</label>
      <Area id="inf-general" value={general} style={{ minHeight: 160 }} onChange={(e) => setGeneral(e.target.value)}
        placeholder="Cómo ha ido la semana en general: novedades, problemas con las cuentas o con el equipo, correcciones, indicaciones…" />

      <label htmlFor="inf-sugerencias" className="text-sm font-medium block mb-1 mt-5">Sugerencias y mejoras</label>
      <Area id="inf-sugerencias" value={sugerencias} style={{ minHeight: 120 }} onChange={(e) => setSugerencias(e.target.value)}
        placeholder="Qué cambiarías o mejorarías: procesos, herramientas, horarios, formación, el propio CRM…" />

      <p className="text-sm font-medium mt-5 mb-2">Observaciones por {cfg.singular}</p>
      {ids.length === 0 && <p className="text-sm mb-3" style={lbl}>No hay {cfg.plural} activos. Puedes añadir uno a mano más abajo.</p>}
      <div className="space-y-3 mb-3">
        {ids.map((id) => (
          <div key={id}>
            <label htmlFor={'inf-sup-' + id} className="text-xs font-medium block mb-1">{nombreDe(id)}</label>
            <Area id={'inf-sup-' + id} value={sup[id] || ''} onChange={(e) => setSup({ ...sup, [id]: e.target.value })}
              placeholder="Qué has observado de esta persona durante la semana: errores corregidos, cómo ha trabajado, qué mejorar…" />
          </div>
        ))}
      </div>
      {candidatos.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="min-w-[220px]">
            <Select value={elegir} onChange={(e) => setElegir(e.target.value)}>
              <option value="">— Añadir otro {cfg.singular} —</option>
              {candidatos.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </Select>
          </div>
          <Button variant="ghost" disabled={!elegir} onClick={() => { setExtra((l) => [...l, elegir]); setSup((s) => ({ ...s, [elegir]: s[elegir] || '' })); setElegir('') }}>+ Añadir</Button>
        </div>
      )}

      {error && <p className="text-sm mt-4" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex items-center gap-2 flex-wrap mt-6">
        <Button onClick={enviar} disabled={enviando || semanaOcupada}>{enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Enviar informe'}</Button>
        <Button variant="ghost" onClick={cancelar} disabled={enviando}>{editando ? 'Cancelar' : 'Volver a la lista'}</Button>
        {!editando && hayTexto && <Button variant="ghost" className="ml-auto" onClick={vaciarBorrador} disabled={enviando}>Vaciar borrador</Button>}
      </div>
      {!editando && <p className="text-xs mt-3" style={lbl}>Lo que escribes se guarda como borrador en este navegador hasta que envíes el informe.</p>}
    </Panel>
  )
}

function DetalleInforme({ informe, cfg, nombres, esMio, puedeEditar, onVolver, onEditar }) {
  const nombreDe = (id) => nombres[id] || '—'
  const nombreManager = nombreDe(informe.manager_id)
  const ids = useMemo(() => Object.keys(informe.supervision || {}).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es')), [informe.supervision, nombres]) // eslint-disable-line

  const texto = useMemo(() => {
    const L = [`INFORME SEMANAL · ${nombreManager} · semana del ${rangoSemana(informe.week_start)}`, `Registrado el ${fmtFechaHora(registrado(informe))}`, '', 'OBSERVACIONES GENERALES DE LA SEMANA', (informe.general || '').trim() || '(sin anotaciones)', '', 'SUGERENCIAS Y MEJORAS', (informe.sugerencias || '').trim() || '(sin anotaciones)', '', `OBSERVACIONES POR ${cfg.singular.toUpperCase()}`]
    const conTexto = ids.filter((id) => !vacio(informe.supervision[id]))
    if (conTexto.length === 0) L.push('(sin anotaciones)')
    conTexto.forEach((id) => L.push('', nombreDe(id).toUpperCase(), informe.supervision[id].trim()))
    return L.join('\n') + '\n'
  }, [informe, ids, nombres]) // eslint-disable-line

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="font-medium">{nombreManager}{esMio ? ' (tú)' : ''}</p>
          <p className="text-xs mt-1" style={lbl}>
            Registrado el {fmtFechaHora(registrado(informe))}{esEditado(informe) ? ` · editado ${fmtFechaHora(informe.updated_at)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" onClick={onVolver}>← Volver a la lista</Button>
          <CopyButton text={texto} label="Copiar informe" />
          {puedeEditar && <Button onClick={onEditar}>Editar</Button>}
        </div>
      </div>

      <p className="text-sm font-medium mb-1">Observaciones generales de la semana</p>
      <TextoLeido texto={informe.general} />

      <p className="text-sm font-medium mb-1 mt-5">Sugerencias y mejoras</p>
      <TextoLeido texto={informe.sugerencias} />

      <p className="text-sm font-medium mb-2 mt-5">Observaciones por {cfg.singular}</p>
      {ids.length === 0 && <p className="text-sm" style={lbl}>Este informe no tiene {cfg.plural}.</p>}
      <div className="space-y-3">
        {ids.map((id) => (
          <div key={id}>
            <p className="text-xs font-medium mb-1">{nombreDe(id)}</p>
            <TextoLeido texto={informe.supervision[id]} />
          </div>
        ))}
      </div>
    </Panel>
  )
}
