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

const normUser = (v) => '@' + String(v || '').replace(/[@\s]/g, '')
const r2 = (n) => Math.round(n * 100) / 100
const fmt$ = (n) => '$' + Number(n || 0).toFixed(2)
const FAN_VACIO = { fan: '', user: '@', monto: '', tipo: 'ppv' }
function totales(compras) {
  const c = compras || []
  return {
    ppv: r2(c.filter((x) => x.tipo === 'ppv').reduce((a, x) => a + Number(x.monto || 0), 0)),
    tips: r2(c.filter((x) => x.tipo === 'tip').reduce((a, x) => a + Number(x.monto || 0), 0)),
  }
}

function validarCompras(compras) {
  for (const c of compras || []) {
    if (!String(c.fan || '').trim()) return 'Hay una compra sin nombre de fan.'
    if (String(c.user || '@').length < 2) return `Falta el @usuario de ${c.fan}.`
    if (!(parseFloat(c.monto) > 0)) return `Falta la cantidad gastada de ${c.fan}.`
  }
  return ''
}
const normalizarCompras = (compras) => (compras || []).map((c) => ({ fan: String(c.fan).trim(), user: c.user, monto: r2(parseFloat(c.monto)), tipo: c.tipo === 'tip' ? 'tip' : 'ppv' }))
const pendiente = (f) => !!f && (f.fan?.trim() || f.monto || (f.user || '@').length > 1)

// Lista de compras editable fila a fila + formulario para añadir otra + totales automáticos
function ComprasEditor({ compras, onChange, nuevo, setNuevo, etiqueta }) {
  const [err, setErr] = useState('')
  const f = { ...FAN_VACIO, ...(nuevo || {}) }
  function setRow(i, key, value) {
    onChange(compras.map((c, j) => (j === i ? { ...c, [key]: key === 'user' ? normUser(value) : value } : c)))
  }
  function setNew(key, value) {
    setNuevo({ ...f, [key]: key === 'user' ? normUser(value) : value })
  }
  function anadir() {
    const msg = validarCompras([f])
    setErr(msg)
    if (msg) return
    onChange([...compras, { fan: f.fan.trim(), user: f.user, monto: f.monto, tipo: f.tipo }])
    setNuevo({ ...FAN_VACIO, tipo: f.tipo })
  }
  const t = totales(compras)
  return (
    <div>
      {compras.length === 0 ? (
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Ninguno todavía. Añade cada compra y los totales se suman solos.</p>
      ) : (
        <div className="mb-3 space-y-2">
          {compras.map((x, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
              <Input placeholder="Nombre del fan" value={x.fan} onChange={(e) => setRow(i, 'fan', e.target.value)} />
              <Input placeholder="@usuario" value={x.user} onChange={(e) => setRow(i, 'user', e.target.value)} />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                <Input type="number" step="0.01" min="0" placeholder="0.00" value={x.monto} onChange={(e) => setRow(i, 'monto', e.target.value)} style={{ paddingLeft: 22 }} />
              </div>
              <Select value={x.tipo} onChange={(e) => setRow(i, 'tipo', e.target.value)}>
                <option value="ppv">PPV</option>
                <option value="tip">Tip</option>
              </Select>
              <button type="button" onClick={() => onChange(compras.filter((_, j) => j !== i))} className="text-xs hover:underline text-left" style={{ color: 'var(--danger)' }}>Quitar</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Añadir otra compra</p>
      <div className="mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Input placeholder="Nombre del fan" value={f.fan} onChange={(e) => setNew('fan', e.target.value)} />
          <Input placeholder="@usuario" value={f.user} onChange={(e) => setNew('user', e.target.value)} />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={f.monto} onChange={(e) => setNew('monto', e.target.value)} style={{ paddingLeft: 22 }} />
          </div>
          <Select value={f.tipo} onChange={(e) => setNew('tipo', e.target.value)}>
            <option value="ppv">PPV</option>
            <option value="tip">Tip</option>
          </Select>
          <Button variant="ghost" onClick={anadir}>Añadir compra</Button>
        </div>
        {err && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{err}</p>}
      </div>
      <div className="flex flex-wrap gap-4 text-sm px-3 py-2 rounded-md" style={{ background: 'var(--accent-soft)' }}>
        <span>PPV facturado: <strong className="tabular-nums" style={{ color: 'var(--success)' }}>{fmt$(t.ppv)}</strong></span>
        <span>Tips: <strong className="tabular-nums" style={{ color: 'var(--gold)' }}>{fmt$(t.tips)}</strong></span>
        <span>Total {etiqueta}: <strong className="tabular-nums">{fmt$(t.ppv + t.tips)}</strong></span>
      </div>
    </div>
  )
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
  const [fanInput, setFanInput] = useState({}) // compra en curso (fan, @user, monto, tipo), por modelo
  const [editDet, setEditDet] = useState(null) // { id, reportId, compras, nuevo } al editar compras de un reporte enviado

  const [fChatter, setFChatter] = useState('todos')
  const [fFecha, setFFecha] = useState('')
  const [chatters, setChatters] = useState([])
  const [borrarAntes, setBorrarAntes] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [totRep, setTotRep] = useState({}) // { [report_id]: { ppv, tips } } para la columna «Facturado»

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
    cargarTotales((r || []).map((x) => x.id))
  }

  // Total facturado de cada turno (PPV + tips de todas las modelos del reporte)
  async function cargarTotales(ids) {
    const acc = {}
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await supabase.from('shift_report_details').select('report_id, facturacion, tips').in('report_id', ids.slice(i, i + 80))
      ;(data || []).forEach((d) => {
        const t = acc[d.report_id] || (acc[d.report_id] = { ppv: 0, tips: 0 })
        t.ppv += Number(d.facturacion || 0)
        t.tips += Number(d.tips || 0)
      })
    }
    setTotRep(acc)
  }

  // Preselecciona el turno asignado al chatter (si lo tiene) para que no tenga que elegirlo a mano,
  // pero se puede cambiar libremente por si cubre otro turno ese día.
  useEffect(() => {
    async function detectarTurnoAsignado() {
      if (!profile) return
      const { data } = await supabase.from('chatters').select('shift').eq('id', profile.id).single()
      const asignados = (data?.shift || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      if (!asignados.length) return
      const actual = turnoActualVE()
      const elegido = asignados.includes(actual) ? actual : asignados[0]
      if (TURNOS.find((t) => t.id === elegido)) { setTurno(elegido); setTurnoAuto(true) }
    }
    detectarTurnoAsignado()
  }, [profile])
  useEffect(() => { load() }, [fChatter, fFecha])

  function toggleModelo(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat([id])))
    setCampos((c) => c[id] ? c : { ...c, [id]: { texto: '', trafico: 'medio', compras: [] } })
  }
  function setCampo(id, key, value) {
    setCampos((c) => ({ ...c, [id]: { ...c[id], [key]: value } }))
  }
  const setNuevoFan = (modelId, v) => setFanInput((f) => ({ ...f, [modelId]: v }))

  async function guardarEdicionCompras(d, reporte) {
    const msg = validarCompras(editDet.compras) || (pendiente(editDet.nuevo) ? 'Tienes una compra a medio rellenar. Pulsa «Añadir compra» o bórrala.' : '')
    if (msg) { setEditDet((e) => ({ ...e, err: msg })); return }
    const compras = normalizarCompras(editDet.compras)
    const t = totales(compras)
    const cambios = {
      compras,
      fans_compradores: compras.map((c) => `${c.fan} (${c.user})`),
      facturacion: t.ppv > 0 ? t.ppv : null,
      tips: t.tips > 0 ? t.tips : null,
    }
    const { error: e } = await supabase.from('shift_report_details').update(cambios).eq('id', d.id)
    if (e) { setEditDet((x) => ({ ...x, err: 'No se pudieron guardar los cambios.' })); return }
    setDetalles((prev) => ({ ...prev, [reporte.id]: (prev[reporte.id] || []).map((x) => (x.id === d.id ? { ...x, ...cambios } : x)) }))
    setEditDet(null)
    cargarTotales(reportes.map((x) => x.id))
  }

  async function enviar() {
    setError(null)
    setOk(null)
    if (!turno) { setError('Selecciona el turno antes de enviar el reporte.'); return }
    if (!sel.length) { setError('Selecciona al menos una modelo.'); return }
    const vacios = sel.filter((id) => !(campos[id]?.texto || '').trim())
    if (vacios.length) { setError('Falta el reporte de alguna modelo seleccionada.'); return }
    const malas = sel.map((id) => validarCompras(campos[id]?.compras)).find(Boolean)
    if (malas) { setError(malas); return }
    if (sel.some((id) => pendiente(fanInput[id]))) { setError('Tienes una compra a medio rellenar. Pulsa «Añadir compra» o bórrala antes de enviar.'); return }
    setBusy(true)
    const { data: rep, error: e1 } = await supabase
      .from('shift_reports')
      .insert([{ chatter_id: profile.id, fecha, turno }])
      .select()
      .single()
    if (e1) { setError('No se pudo guardar el reporte.'); setBusy(false); return }
    const detalle = sel.map((model_id) => {
      const compras = normalizarCompras(campos[model_id].compras)
      const t = totales(compras)
      return {
        report_id: rep.id,
        model_id,
        texto: campos[model_id].texto.trim(),
        trafico: campos[model_id].trafico || null,
        compras,
        fans_compradores: compras.map((c) => `${c.fan} (${c.user})`),
        facturacion: t.ppv > 0 ? t.ppv : null,
        tips: t.tips > 0 ? t.tips : null,
      }
    })
    const { error: e2 } = await supabase.from('shift_report_details').insert(detalle)
    if (e2) { setError('El reporte se creó pero falló el detalle.'); setBusy(false); return }
    setSel([])
    setCampos({})
    setFanInput({})
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
      det.forEach((d) => filas.push({ ...r, modelo: d.models?.stage_name, texto: d.texto, trafico: d.trafico, facturacion: d.facturacion, tips: d.tips, fans: (d.fans_compradores || []).join(', '), compras: (d.compras || []).map((c) => `${c.fan} ${c.user} ${fmt$(c.monto)} ${c.tipo === 'tip' ? 'tip' : 'PPV'}`).join(' | ') }))
    }
    exportCSV('reportes_de_turno', filas, [
      { label: 'Fecha', get: (r) => fmtFecha(r.fecha) },
      { label: 'Turno', get: (r) => T_NAME(r.turno) },
      { label: 'Chatter', get: (r) => r.profiles?.full_name || '' },
      { label: 'Modelo', key: 'modelo' },
      { label: 'Tráfico', get: (r) => TRAFICO.find((t) => t.id === r.trafico)?.n || '' },
      { label: 'Facturación', key: 'facturacion' },
      { label: 'Tips', key: 'tips' },
      { label: 'Total modelo (PPV + tips)', get: (r) => r2(Number(r.facturacion || 0) + Number(r.tips || 0)) },
      { label: 'Reporte', key: 'texto' },
      { label: 'Fans que compraron', key: 'fans' },
      { label: 'Detalle de compras', key: 'compras' },
      { label: 'Enviado', get: (r) => fmtTS(r.created_at) },
    ])
  }

  return (
    <div>
      <PageHeader title="Reportes de turno" subtitle="Al final de tu turno, reporta cómo fue con cada modelo que llevaste." />

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">Nuevo reporte</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
              </div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Fans que compraron en este turno</label>
              <ComprasEditor
                compras={c.compras || []}
                onChange={(v) => setCampo(id, 'compras', v)}
                nuevo={fanInput[id]}
                setNuevo={(v) => setNuevoFan(id, v)}
                etiqueta={modelo?.stage_name}
              />
            </Panel>
          )
        })}

        {sel.length > 0 && (() => {
          const filasTot = sel.map((id) => ({ nombre: modelos.find((m) => m.id === id)?.stage_name, ...totales(campos[id]?.compras) }))
          const ppv = r2(filasTot.reduce((a, x) => a + x.ppv, 0))
          const tips = r2(filasTot.reduce((a, x) => a + x.tips, 0))
          return (
            <div className="p-4 rounded-md mb-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <span className="text-sm font-medium">Total facturado en este turno</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{fmt$(ppv + tips)}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                PPV {fmt$(ppv)} · Tips {fmt$(tips)}
                {filasTot.length > 1 && ' · ' + filasTot.map((x) => `${x.nombre}: ${fmt$(x.ppv + x.tips)}`).join(' · ')}
              </p>
            </div>
          )
        })()}

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
                  {['Fecha', 'Turno', 'Chatter', 'Facturado', 'Enviado', ''].map((c) => (
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
                      <td className="px-3 py-2 tabular-nums font-medium">{totRep[r.id] ? fmt$(totRep[r.id].ppv + totRep[r.id].tips) : '—'}</td>
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
                        <td colSpan={6} className="px-4 py-5" style={{ background: 'var(--panel-alt)' }}>
                          {(detalles[r.id] || []).length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
                          ) : (() => {
                            const det = detalles[r.id] || []
                            const ppv = r2(det.reduce((a, d) => a + Number(d.facturacion || 0), 0))
                            const tips = r2(det.reduce((a, d) => a + Number(d.tips || 0), 0))
                            const nCompras = det.reduce((a, d) => a + (d.compras?.length || d.fans_compradores?.length || 0), 0)
                            return (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="col-span-2 md:col-span-1 rounded-lg px-4 py-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total del turno</p>
                                    <p className="font-display text-2xl font-semibold tabular-nums">{fmt$(ppv + tips)}</p>
                                  </div>
                                  {[['PPV', fmt$(ppv), 'var(--success)'], ['Tips', fmt$(tips), 'var(--gold)'], ['Compras', `${nCompras} · ${det.length} ${det.length === 1 ? 'modelo' : 'modelos'}`, 'var(--text)']].map(([t, v, c]) => (
                                    <div key={t} className="rounded-lg px-4 py-3" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t}</p>
                                      <p className="font-display text-xl font-semibold tabular-nums" style={{ color: c }}>{v}</p>
                                    </div>
                                  ))}
                                </div>

                                {det.map((d) => {
                                  const tf = TRAFICO.find((t) => t.id === d.trafico)
                                  const totM = r2(Number(d.facturacion || 0) + Number(d.tips || 0))
                                  return (
                                    <div key={d.id} className="rounded-lg overflow-hidden" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                                      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${tf?.color || 'var(--border)'}` }}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <strong className="text-base" style={{ color: 'var(--accent)' }}>{d.models?.stage_name}</strong>
                                          {tf && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${tf.color}22`, color: tf.color }}>Tráfico {tf.n}</span>}
                                        </div>
                                        <div className="text-right">
                                          <span className="font-display text-lg font-semibold tabular-nums">{fmt$(totM)}</span>
                                          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>PPV {fmt$(d.facturacion)} · Tips {fmt$(d.tips)}</span>
                                        </div>
                                      </div>

                                      <div className="px-4 py-3 space-y-3">
                                        {d.texto && (
                                          <div>
                                            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Resumen del turno</p>
                                            <p className="text-sm whitespace-pre-wrap pl-3" style={{ borderLeft: '2px solid var(--border)' }}>{d.texto}</p>
                                          </div>
                                        )}

                                        {editDet?.id === d.id ? (
                                          <div className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                                            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Editando compras. Al guardar, el PPV facturado y los tips se recalculan con estas compras.</p>
                                            <ComprasEditor
                                              compras={editDet.compras}
                                              onChange={(v) => setEditDet((e) => ({ ...e, compras: v, err: '' }))}
                                              nuevo={editDet.nuevo}
                                              setNuevo={(v) => setEditDet((e) => ({ ...e, nuevo: v }))}
                                              etiqueta={d.models?.stage_name}
                                            />
                                            {editDet.err && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{editDet.err}</p>}
                                            <div className="flex gap-2 mt-3">
                                              <Button onClick={() => guardarEdicionCompras(d, r)}>Guardar cambios</Button>
                                              <Button variant="ghost" onClick={() => setEditDet(null)}>Cancelar</Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div className="flex items-center justify-between mb-1">
                                              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Fans que compraron{d.compras?.length ? ` (${d.compras.length})` : ''}</p>
                                              {(esMgr || r.chatter_id === profile.id) && (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); setEditDet({ id: d.id, compras: d.compras?.length ? d.compras.map((x) => ({ ...x })) : (d.fans_compradores || []).map((n) => ({ fan: n, user: '@', monto: '', tipo: 'ppv' })), nuevo: FAN_VACIO, err: '' }) }}
                                                  className="text-xs hover:underline"
                                                  style={{ color: 'var(--accent)' }}
                                                >
                                                  Editar compras
                                                </button>
                                              )}
                                            </div>
                                            {d.compras?.length > 0 ? (
                                              <table className="w-full text-sm">
                                                <tbody>
                                                  {d.compras.map((x, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                      <td className="py-1.5 pr-3 font-medium">{x.fan}</td>
                                                      <td className="py-1.5 pr-3" style={{ color: 'var(--text-muted)' }}>{x.user}</td>
                                                      <td className="py-1.5 pr-3">
                                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: x.tipo === 'tip' ? 'var(--gold)22' : 'var(--success)22', color: x.tipo === 'tip' ? 'var(--gold)' : 'var(--success)' }}>{x.tipo === 'tip' ? 'Tip' : 'PPV'}</span>
                                                      </td>
                                                      <td className="py-1.5 text-right tabular-nums font-medium">{fmt$(x.monto)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            ) : d.fans_compradores?.length > 0 ? (
                                              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{d.fans_compradores.join(', ')}</p>
                                            ) : (
                                              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin compras registradas.</p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()}
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
