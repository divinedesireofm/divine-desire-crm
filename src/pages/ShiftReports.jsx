import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { exportCSV } from '../lib/csv'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const TURNOS = [
  { id: 'madrugada', n: 'Madrugada', h: '2:00 – 10:00 VE' },
  { id: 'mañana', n: 'Mañana', h: '10:00 – 18:00 VE' },
  { id: 'tarde', n: 'Tarde', h: '18:00 – 2:00 VE' },
]
const T_NAME = (id) => TURNOS.find((t) => t.id === id)?.n || id
const TRAFICO = [
  { id: 'bajo', n: 'Bajo', color: 'var(--danger)' },
  { id: 'medio', n: 'Medio', color: 'var(--gold)' },
  { id: 'alto', n: 'Alto', color: 'var(--success)' },
]

function turnoActualVE() {
  const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: 'numeric', hour12: false }).format(new Date()), 10)
  if (h >= 2 && h < 10) return 'madrugada'
  if (h >= 10 && h < 18) return 'mañana'
  return 'tarde'
}
function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function fmtFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtTS(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function ShiftReports() {
  const { profile, hasAnyRole, hasRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [modelos, setModelos] = useState([])
  const [reportes, setReportes] = useState([])
  const [detalles, setDetalles] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  const [fecha, setFecha] = useState(fechaHoyISO())
  const [turno, setTurno] = useState(turnoActualVE())
  const [turnoAuto, setTurnoAuto] = useState(false)
  const [sel, setSel] = useState([])
  const [campos, setCampos] = useState({}) // { [modelId]: { texto, trafico, fans, facturacion } }
  const [fanInput, setFanInput] = useState({}) // texto en curso del input de fans, por modelo

  const [fChatter, setFChatter] = useState('todos')
  const [fFecha, setFFecha] = useState('')
  const [chatters, setChatters] = useState([])
  const [borrarAntes, setBorrarAntes] = useState('')
  const [borrando, setBorrando] = useState(false)

  async function load() {
    let q = supabase.from('shift_reports').select('*, profiles(full_name)').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (fChatter !== 'todos') q = q.eq('chatter_id', fChatter)
    if (fFecha) q = q.eq('fecha', fFecha)
    const [{ data: m }, { data: r }, cs] = await Promise.all([
      supabase.from('models').select('id, stage_name').eq('status', 'activa').order('stage_name'),
      q,
      getProfilesByRoles(['manager', 'chatter']),
    ])
    setModelos(m || [])
    setReportes(r || [])
    setChatters(cs)
  }

  // Preselecciona el turno asignado al chatter (si lo tiene) para que no tenga que elegirlo a mano,
  // pero se puede cambiar libremente por si cubre otro turno ese día.
  useEffect(() => {
    async function detectarTurnoAsignado() {
      if (!profile) return
      const { data } = await supabase.from('chatters').select('shift').eq('id', profile.id).single()
      const shift = (data?.shift || '').trim().toLowerCase()
      const match = TURNOS.find((t) => t.id === shift)
      if (match) { setTurno(match.id); setTurnoAuto(true) }
    }
    detectarTurnoAsignado()
  }, [profile])
  useEffect(() => { load() }, [fChatter, fFecha])

  function toggleModelo(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat([id])))
    setCampos((c) => c[id] ? c : { ...c, [id]: { texto: '', trafico: 'medio', fans: [], facturacion: '' } })
  }
  function setCampo(id, key, value) {
    setCampos((c) => ({ ...c, [id]: { ...c[id], [key]: value } }))
  }
  function agregarFan(modelId) {
    const nombre = (fanInput[modelId] || '').trim()
    if (!nombre) return
    setCampos((c) => ({ ...c, [modelId]: { ...c[modelId], fans: [...(c[modelId]?.fans || []), nombre] } }))
    setFanInput((f) => ({ ...f, [modelId]: '' }))
  }
  function quitarFan(modelId, i) {
    setCampos((c) => ({ ...c, [modelId]: { ...c[modelId], fans: c[modelId].fans.filter((_, j) => j !== i) } }))
  }

  async function enviar() {
    setError(null)
    setOk(null)
    if (!turno) { setError('Selecciona el turno antes de enviar el reporte.'); return }
    if (!sel.length) { setError('Selecciona al menos una modelo.'); return }
    const vacios = sel.filter((id) => !(campos[id]?.texto || '').trim())
    if (vacios.length) { setError('Falta el reporte de alguna modelo seleccionada.'); return }
    setBusy(true)
    const { data: rep, error: e1 } = await supabase
      .from('shift_reports')
      .insert([{ chatter_id: profile.id, fecha, turno }])
      .select()
      .single()
    if (e1) { setError('No se pudo guardar el reporte.'); setBusy(false); return }
    const detalle = sel.map((model_id) => ({
      report_id: rep.id,
      model_id,
      texto: campos[model_id].texto.trim(),
      trafico: campos[model_id].trafico || null,
      fans_compradores: campos[model_id].fans || [],
      facturacion: campos[model_id].facturacion ? parseFloat(campos[model_id].facturacion) : null,
    }))
    const { error: e2 } = await supabase.from('shift_report_details').insert(detalle)
    if (e2) { setError('El reporte se creó pero falló el detalle.'); setBusy(false); return }
    setSel([])
    setCampos({})
    setOk('Reporte enviado ✓')
    await load()
    setBusy(false)
  }

  async function verDetalle(rep) {
    if (abierto === rep.id) { setAbierto(null); return }
    setAbierto(rep.id)
    if (!detalles[rep.id]) {
      const { data } = await supabase.from('shift_report_details').select('*, models(stage_name)').eq('report_id', rep.id)
      setDetalles((prev) => ({ ...prev, [rep.id]: data || [] }))
    }
  }

  async function borrarReporte(rep) {
    if (!confirm('¿Eliminar este reporte de turno?')) return
    await supabase.from('shift_reports').delete().eq('id', rep.id)
    load()
  }

  async function borrarAntiguos() {
    if (!borrarAntes) return
    if (!confirm(`¿Borrar TODOS los reportes anteriores al ${borrarAntes}? Esta acción no se puede deshacer.`)) return
    setBorrando(true)
    await supabase.from('shift_reports').delete().lt('fecha', borrarAntes)
    setBorrando(false)
    setBorrarAntes('')
    load()
  }

  async function exportar() {
    // Exportamos a nivel de detalle (una fila por modelo dentro de cada reporte)
    const filas = []
    for (const r of reportes) {
      let det = detalles[r.id]
      if (!det) {
        const { data } = await supabase.from('shift_report_details').select('*, models(stage_name)').eq('report_id', r.id)
        det = data || []
      }
      det.forEach((d) => filas.push({ ...r, modelo: d.models?.stage_name, texto: d.texto, trafico: d.trafico, facturacion: d.facturacion, fans: (d.fans_compradores || []).join(', ') }))
    }
    exportCSV('reportes_de_turno', filas, [
      { label: 'Fecha', get: (r) => fmtFecha(r.fecha) },
      { label: 'Turno', get: (r) => T_NAME(r.turno) },
      { label: 'Chatter', get: (r) => r.profiles?.full_name || '' },
      { label: 'Modelo', key: 'modelo' },
      { label: 'Tráfico', get: (r) => TRAFICO.find((t) => t.id === r.trafico)?.n || '' },
      { label: 'Facturación', key: 'facturacion' },
      { label: 'Reporte', key: 'texto' },
      { label: 'Fans que compraron', key: 'fans' },
      { label: 'Enviado', get: (r) => fmtTS(r.created_at) },
    ])
  }

  return (
    <div>
      <PageHeader title="Reportes de turno" subtitle="Al final de tu turno, reporta cómo fue con cada modelo que llevaste." />

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">Nuevo reporte</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Turno {turnoAuto && <span style={{ color: 'var(--accent)' }}>· detectado según tu turno asignado, cámbialo si estás cubriendo otro</span>}
            </label>
            <Select value={turno} onChange={(e) => { setTurno(e.target.value); setTurnoAuto(false) }}>
              <option value="">Selecciona turno…</option>
              {TURNOS.map((t) => <option key={t.id} value={t.id}>{t.n} ({t.h})</option>)}
            </Select>
          </div>
        </div>

        <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Modelos del turno</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {modelos.map((m) => {
            const active = sel.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleModelo(m.id)}
                className="px-3 py-1.5 rounded-full text-sm transition-colors"
                style={{
                  background: active ? 'var(--accent-soft)' : 'var(--panel-alt)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {m.stage_name}
              </button>
            )
          })}
        </div>

        {sel.map((id) => {
          const modelo = modelos.find((m) => m.id === id)
          const c = campos[id] || {}
          return (
            <Panel key={id} className="p-4 mb-3">
              <p className="text-sm font-medium mb-3">Reporte de {modelo?.stage_name}</p>
              <textarea
                value={c.texto || ''}
                onChange={(e) => setCampo(id, 'texto', e.target.value)}
                placeholder={`¿Cómo fue el turno con ${modelo?.stage_name}? Ventas, fans importantes, pendientes, incidencias...`}
                rows={3}
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
                style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tráfico del turno</label>
                  <div className="flex gap-2">
                    {TRAFICO.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setCampo(id, 'trafico', t.id)}
                        className="flex-1 px-2 py-1.5 rounded-md text-xs"
                        style={{
                          background: c.trafico === t.id ? `${t.color}22` : 'var(--panel-alt)',
                          border: `1px solid ${c.trafico === t.id ? t.color : 'var(--border)'}`,
                          color: c.trafico === t.id ? t.color : 'var(--text)',
                        }}
                      >
                        {t.n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Facturado en el turno</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                    <Input
                      type="number" step="0.01" placeholder="0.00"
                      value={c.facturacion || ''}
                      onChange={(e) => setCampo(id, 'facturacion', e.target.value)}
                      style={{ paddingLeft: 22 }}
                    />
                  </div>
                </div>
              </div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fans que compraron en este turno</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(c.fans || []).length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ninguno todavía</span>}
                {(c.fans || []).map((f, i) => (
                  <span
                    key={i}
                    onClick={() => quitarFan(id, i)}
                    title="Clic para quitar"
                    className="px-2 py-1 rounded-full text-xs cursor-pointer"
                    style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {f} ✕
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre o usuario del fan"
                  value={fanInput[id] || ''}
                  onChange={(e) => setFanInput((f) => ({ ...f, [id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarFan(id) } }}
                />
                <Button variant="ghost" onClick={() => agregarFan(id)}>Añadir</Button>
              </div>
            </Panel>
          )
        })}

        {error && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        {ok && <p className="text-sm mb-2" style={{ color: 'var(--success)' }}>{ok}</p>}
        <Button onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar reporte'}</Button>
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="text-sm font-medium">Reportes del equipo</p>
          <div className="flex gap-2">
            <Select value={fChatter} onChange={(e) => setFChatter(e.target.value)} className="max-w-[180px]">
              <option value="todos">Todos</option>
              {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
            <Input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="max-w-[160px]" />
            <Button variant="ghost" onClick={exportar}>Exportar a Excel</Button>
          </div>
        </div>
        {hasRole('admin') && (
          <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Borrar reportes anteriores a:</span>
            <Input type="date" value={borrarAntes} onChange={(e) => setBorrarAntes(e.target.value)} className="max-w-[160px]" />
            <Button variant="danger" onClick={borrarAntiguos} disabled={!borrarAntes || borrando}>
              {borrando ? 'Borrando…' : 'Borrar'}
            </Button>
          </div>
        )}
        {reportes.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Sin reportes todavía</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Turno', 'Chatter', 'Enviado', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportes.map((r) => (
                  <Fragment key={r.id}>
                    <tr onClick={() => verDetalle(r)} className="cursor-pointer hover:opacity-80" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2">{fmtFecha(r.fecha)}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          {T_NAME(r.turno)}
                        </span>
                      </td>
                      <td className="px-3 py-2"><strong>{r.profiles?.full_name}</strong></td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-muted)' }}>
                        {hasRole('admin') && (
                          <button onClick={(e) => { e.stopPropagation(); borrarReporte(r) }} className="mr-3 hover:underline" style={{ color: 'var(--danger)' }}>
                            Borrar
                          </button>
                        )}
                        {abierto === r.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {abierto === r.id && (
                      <tr>
                        <td colSpan={5} className="px-3 py-3" style={{ background: 'var(--panel-alt)' }}>
                          {(detalles[r.id] || []).length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
                          ) : (
                            (detalles[r.id] || []).map((d) => (
                              <div key={d.id} className="mb-3">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <strong style={{ color: 'var(--accent)' }}>{d.models?.stage_name}</strong>
                                  {d.trafico && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${TRAFICO.find((t) => t.id === d.trafico)?.color}22`, color: TRAFICO.find((t) => t.id === d.trafico)?.color }}>
                                      Tráfico {TRAFICO.find((t) => t.id === d.trafico)?.n}
                                    </span>
                                  )}
                                  {d.facturacion != null && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--success)22', color: 'var(--success)' }}>
                                      ${Number(d.facturacion).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div className="whitespace-pre-wrap">{d.texto}</div>
                                {d.fans_compradores?.length > 0 && (
                                  <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                                    <strong>Fans que compraron:</strong> {d.fans_compradores.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
