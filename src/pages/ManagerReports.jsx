import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import AdjuntosInforme from '../components/AdjuntosInforme'
import { lunesDe, fmtF } from '../lib/excelImport'

const hoy = () => new Date().toISOString().slice(0, 10)
const sumarDias = (isoStr, n) => { const d = new Date(isoStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const lbl = { color: 'var(--text-muted)' }

// area: 'chatting' (manager de chatting + sus chatters) | 'instagram' (manager de Instagram + sus asistentes)
const AREAS = {
  chatting: { titulo: 'Informes del manager', rolManager: 'manager', rolesEquipo: ['chatter'], quienes: 'chatters', textoManager: 'manager', recaptacion: true },
  instagram: { titulo: 'Informes del manager de Instagram', rolManager: 'ig_manager', rolesEquipo: ['ig_assistant'], quienes: 'asistentes de Instagram', textoManager: 'manager de Instagram' },
}

function Area(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 80, ...props.style }} />
}

export default function ManagerReports({ area = 'chatting' }) {
  const cfg = AREAS[area]
  const { profile, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const autorizado = esAdmin || hasRole(cfg.rolManager)   // solo managers y dirección
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
      getProfilesByRoles(cfg.rolesEquipo), // para añadir a mano: solo gente de esta área (p. ej. chatters inactivos)
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
  const sinInforme = esAdmin ? managers.filter((m) => !informes.some((r) => r.manager_id === m.id && r.enviado_at)) : []

  async function crearInforme() {
    const supervision = Object.fromEntries(equipo.map((x) => [x.id, '']))
    const { data, error } = await supabase.from('manager_weekly_reports').insert({ manager_id: profile.id, area, week_start: semana, supervision, general: '', recaptacion: '', recaptacion_ok: false, imagenes: {} }).select().single()
    if (error) { setErr(error.message); return }
    setInformes((l) => [...l, data])
  }

  if (!autorizado) {
    return (
      <div>
        <PageHeader title={cfg.titulo} />
        <Panel className="p-6 text-sm text-center" style={lbl}>Este apartado es solo para los managers y la dirección.</Panel>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={cfg.titulo}
        subtitle={esAdmin
          ? `El informe semanal de cada ${cfg.textoManager}: su supervisión de cada trabajador${cfg.recaptacion ? ', la recaptación de ballenas y favoritos' : ''} y las observaciones generales de la semana.`
          : `Cada semana, rellena TODOS los apartados (la supervisión de cada trabajador${cfg.recaptacion ? ', la recaptación de ballenas y favoritos' : ''} y las observaciones generales) y envía el informe. Adjuntar imágenes es opcional.`}
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
              <p className="text-sm"><strong style={{ color: 'var(--gold)' }}>⚠ Sin enviar esta semana:</strong> {sinInforme.map((m) => m.full_name).join(', ')}</p>
            </Panel>
          )}
          {visibles.length === 0 && (
            <Panel className="p-6 text-sm text-center" style={lbl}>
              {esAdmin ? 'Todavía no hay informes esta semana. Puedes crear el tuyo con «+ Añadir informe de la semana».' : puedeEscribir ? 'Aún no has añadido el informe de esta semana. Pulsa «+ Añadir informe de la semana».' : 'No hay informe esta semana.'}
            </Panel>
          )}
          {visibles.map((r) => (
            <Informe key={r.id} informe={r} editable={r.manager_id === profile?.id && puedeEscribir} mostrarManager={esAdmin}
              nombreManager={nombres[r.manager_id] || '—'} equipo={equipo} todos={todos} nombres={nombres} quienes={cfg.quienes} recaptacion={!!cfg.recaptacion} setErr={setErr}
              onGuardado={(nuevo) => setInformes((l) => l.map((x) => (x.id === nuevo.id ? { ...x, ...nuevo } : x)))} />
          ))}
        </>
      )}
    </div>
  )
}

function Informe({ informe, editable, mostrarManager, nombreManager, equipo, todos, nombres, quienes, recaptacion, setErr, onGuardado }) {
  const [sup, setSup] = useState(informe.supervision || {})
  const [general, setGeneral] = useState(informe.general || '')
  const [recap, setRecap] = useState(informe.recaptacion || '')
  const [recOk, setRecOk] = useState(!!informe.recaptacion_ok)
  const [imagenes, setImagenes] = useState(informe.imagenes || {})
  const [extra, setExtra] = useState([]) // trabajadores añadidos a mano en esta sesión
  const [elegir, setElegir] = useState('')
  const [estado, setEstado] = useState('') // '' | 'sin guardar' | 'guardando' | 'guardado'
  const [intento, setIntento] = useState(false) // se ha intentado enviar: se marcan en rojo los apartados vacíos
  const nombreDe = (id) => nombres[id] || '—'
  const enviado = !!informe.enviado_at

  // Cajas: los trabajadores del equipo + los que ya tenían texto + los añadidos a mano
  const ids = useMemo(() => {
    const set = new Set([...equipo.map((x) => x.id), ...Object.keys(informe.supervision || {}), ...extra])
    return Array.from(set).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'))
  }, [equipo, informe.supervision, extra, nombres]) // eslint-disable-line
  const candidatos = todos.filter((x) => !ids.includes(x.id))

  // Apartados obligatorios que faltan
  const faltan = []
  ids.forEach((id) => { if (!(sup[id] || '').trim()) faltan.push(`Supervisión de ${nombreDe(id)}`) })
  if (recaptacion && !recap.trim()) faltan.push('Recaptación de ballenas y favoritos')
  if (recaptacion && !recOk) faltan.push('Confirmar la recaptación de ballenas y favoritos')
  if (!general.trim()) faltan.push('Observaciones, correcciones e indicaciones generales')
  const completo = faltan.length === 0
  const rojo = (vacio) => (intento && vacio ? { borderColor: 'var(--danger)' } : {})

  const cuerpo = (extraCampos = {}) => ({ supervision: sup, general, recaptacion: recap, recaptacion_ok: recOk, updated_at: new Date().toISOString(), ...extraCampos })
  async function guardar(extraCampos = {}) {
    setEstado('guardando')
    const payload = cuerpo(extraCampos)
    const { error } = await supabase.from('manager_weekly_reports').update(payload).eq('id', informe.id)
    if (error) { setErr(error.message); setEstado('sin guardar'); return false }
    setErr(''); setEstado('guardado'); onGuardado({ id: informe.id, ...payload }); return true
  }
  // Los informes ya enviados solo se pueden guardar si siguen completos
  const puedeGuardar = !enviado || completo
  const cambiado = JSON.stringify(sup) !== JSON.stringify(informe.supervision || {}) || general !== (informe.general || '') || recap !== (informe.recaptacion || '') || recOk !== !!informe.recaptacion_ok
  const alSalir = () => { if (cambiado && puedeGuardar) guardar() }
  async function enviar() {
    if (!completo) { setIntento(true); return }
    if (await guardar({ enviado_at: new Date().toISOString() })) setIntento(false)
  }
  async function guardarImagenes(clave, lista) {
    const nuevo = { ...imagenes, [clave]: lista }
    setImagenes(nuevo)
    const { error } = await supabase.from('manager_weekly_reports').update({ imagenes: nuevo }).eq('id', informe.id)
    if (error) { setErr(error.message); return }
    onGuardado({ id: informe.id, imagenes: nuevo })
  }
  const adj = (clave) => (
    <AdjuntosInforme managerId={informe.manager_id} informeId={informe.id} clave={clave} imagenes={imagenes[clave] || []} editable={editable} onCambio={(l) => guardarImagenes(clave, l)} />
  )
  const nImg = (clave) => (informe.imagenes?.[clave] || []).length

  const texto = useMemo(() => {
    const L = [`INFORME SEMANAL${mostrarManager ? ' · ' + nombreManager : ''} · semana del ${fmtF(informe.week_start)}`, '', 'SUPERVISIÓN POR TRABAJADOR']
    ids.forEach((id) => { if ((informe.supervision?.[id] || '').trim()) L.push('', nombreDe(id).toUpperCase() + (nImg(id) ? ` (${nImg(id)} imágenes adjuntas)` : ''), informe.supervision[id].trim()) })
    if (recaptacion) L.push('', 'RECAPTACIÓN DE BALLENAS Y FAVORITOS' + (nImg('recaptacion') ? ` (${nImg('recaptacion')} imágenes adjuntas)` : ''), (informe.recaptacion || '').trim() || '(sin anotaciones)', informe.recaptacion_ok ? '✓ Recaptación confirmada' : '')
    L.push('', 'OBSERVACIONES, CORRECCIONES E INDICACIONES GENERALES' + (nImg('general') ? ` (${nImg('general')} imágenes adjuntas)` : ''), (informe.general || '').trim() || '(sin anotaciones)')
    return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n') + '\n'
  }, [informe, ids, nombres]) // eslint-disable-line

  const ro = (valor) => ({ background: 'var(--panel-alt)', border: '1px solid var(--border)', ...(valor ? {} : lbl) })
  const req = <span style={{ color: 'var(--danger)' }}> *</span>
  const chip = enviado
    ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--success)', border: '1px solid var(--success)' }}>✓ Enviado el {new Date(informe.enviado_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--gold)', border: '1px solid var(--gold)' }}>Borrador sin enviar</span>

  return (
    <Panel className="p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="font-medium">{mostrarManager && !editable ? nombreManager : 'Mi informe'} <span className="text-xs font-normal ml-2" style={lbl}>semana del {fmtF(informe.week_start)}</span> <span className="ml-2">{chip}</span></p>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && <span className="text-xs" style={{ color: estado === 'guardado' && !cambiado ? 'var(--success)' : cambiado ? 'var(--gold)' : 'var(--text-muted)' }}>{estado === 'guardando' ? 'Guardando…' : cambiado ? 'Cambios sin guardar' : estado === 'guardado' ? '✓ Guardado' : ''}</span>}
          <CopyButton text={texto} label="Copiar informe" />
          {editable && enviado && <Button variant="ghost" onClick={() => (completo ? guardar() : setIntento(true))} disabled={!cambiado || estado === 'guardando'}>Guardar cambios</Button>}
          {editable && !enviado && <Button onClick={enviar}>Enviar informe</Button>}
        </div>
      </div>

      {editable && intento && !completo && (
        <div className="p-3 rounded-md mb-4 text-sm" style={{ border: '1px solid var(--danger)', background: 'var(--panel-alt)' }}>
          <strong style={{ color: 'var(--danger)' }}>Faltan apartados obligatorios:</strong>
          <ul className="list-disc ml-5 mt-1">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {editable && !enviado && <p className="text-xs mb-4" style={lbl}>Todos los apartados marcados con <span style={{ color: 'var(--danger)' }}>*</span> son obligatorios para enviar el informe. Lo que escribas se guarda solo como borrador. Las imágenes son opcionales.</p>}

      <p className="text-sm font-medium mb-2">Supervisión por trabajador{req}</p>
      {ids.length === 0 && <p className="text-sm mb-3" style={lbl}>No hay {quienes} activos. Añade uno a mano abajo.</p>}
      <div className="space-y-3 mb-3">
        {ids.map((id) => (
          <div key={id}>
            <label className="text-xs font-medium block mb-1">{nombreDe(id)}{req}</label>
            {editable
              ? <Area value={sup[id] || ''} style={rojo(!(sup[id] || '').trim())} placeholder="Errores corregidos, observaciones, cómo ha trabajado…" onChange={(e) => setSup({ ...sup, [id]: e.target.value })} onBlur={alSalir} />
              : <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={ro(informe.supervision?.[id])}>{informe.supervision?.[id] || 'Sin anotaciones.'}</p>}
            {adj(id)}
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

      {recaptacion && (
        <div className="mb-6">
          <p className="text-sm font-medium mb-1">🐋 Recaptación de ballenas y favoritos{req}</p>
          <p className="text-xs mb-2" style={lbl}>Cuenta cómo ha ido la recaptación de los fans que más han gastado: a quién se ha escrito, qué han respondido, qué se ha recuperado y qué queda pendiente.</p>
          {editable
            ? <Area value={recap} style={{ minHeight: 130, ...rojo(!recap.trim()) }} placeholder="Ej.: Se ha recaptado a X (gastó $…) → respondió…; Y no ha contestado, se reintenta el jueves…" onChange={(e) => setRecap(e.target.value)} onBlur={alSalir} />
            : <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={ro(informe.recaptacion)}>{informe.recaptacion || 'Sin anotaciones.'}</p>}
          {editable
            ? (
              <label className="flex items-center gap-2 text-sm mt-2 cursor-pointer" style={intento && !recOk ? { color: 'var(--danger)' } : undefined}>
                <input type="checkbox" checked={recOk} onChange={(e) => setRecOk(e.target.checked)} onBlur={alSalir} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                Confirmo que he revisado y reportado la recaptación de ballenas y favoritos de esta semana{req}
              </label>
            )
            : <p className="text-xs mt-2" style={{ color: informe.recaptacion_ok ? 'var(--success)' : 'var(--gold)' }}>{informe.recaptacion_ok ? '✓ Recaptación confirmada' : 'Recaptación sin confirmar'}</p>}
          {adj('recaptacion')}
        </div>
      )}

      <p className="text-sm font-medium mb-2">Observaciones, correcciones e indicaciones generales de la semana{req}</p>
      {editable
        ? <Area value={general} style={{ minHeight: 180, ...rojo(!general.trim()) }} placeholder="Novedades y problemas con las cuentas o con el trabajo del equipo, correcciones generales, indicaciones…" onChange={(e) => setGeneral(e.target.value)} onBlur={alSalir} />
        : <p className="text-sm whitespace-pre-wrap px-3 py-2 rounded-md" style={ro(informe.general)}>{informe.general || 'Sin anotaciones.'}</p>}
      {adj('general')}
    </Panel>
  )
}
