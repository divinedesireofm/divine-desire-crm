import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const TURNOS = [
  { id: 'mañana', n: 'Mañana', h: '8:00 – 16:00 COL' },
  { id: 'tarde', n: 'Tarde', h: '16:00 – 24:00 COL' },
  { id: 'madrugada', n: 'Madrugada', h: '0:00 – 8:00 COL' },
]
const T_NAME = (id) => TURNOS.find((t) => t.id === id)?.n || id

function turnoActualCOL() {
  const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }).format(new Date()), 10)
  if (h >= 8 && h < 16) return 'mañana'
  if (h >= 16) return 'tarde'
  return 'madrugada'
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
  const { profile } = useAuth()
  const [modelos, setModelos] = useState([])
  const [reportes, setReportes] = useState([])
  const [detalles, setDetalles] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  const [fecha, setFecha] = useState(fechaHoyISO())
  const [turno, setTurno] = useState(turnoActualCOL())
  const [sel, setSel] = useState([])
  const [textos, setTextos] = useState({})

  async function load() {
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from('models').select('id, stage_name').eq('status', 'activa').order('stage_name'),
      supabase.from('shift_reports').select('*, profiles(full_name)').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(120),
    ])
    setModelos(m || [])
    setReportes(r || [])
  }

  useEffect(() => { load() }, [])

  function toggleModelo(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat([id])))
  }

  async function enviar() {
    setError(null)
    setOk(null)
    if (!sel.length) { setError('Selecciona al menos una modelo.'); return }
    const vacios = sel.filter((id) => !(textos[id] || '').trim())
    if (vacios.length) { setError('Falta el texto del reporte de alguna modelo seleccionada.'); return }
    setBusy(true)
    const { data: rep, error: e1 } = await supabase
      .from('shift_reports')
      .insert([{ chatter_id: profile.id, fecha, turno }])
      .select()
      .single()
    if (e1) { setError('No se pudo guardar el reporte.'); setBusy(false); return }
    const detalle = sel.map((model_id) => ({ report_id: rep.id, model_id, texto: textos[model_id].trim() }))
    const { error: e2 } = await supabase.from('shift_report_details').insert(detalle)
    if (e2) { setError('El reporte se creó pero falló el detalle.'); setBusy(false); return }
    setSel([])
    setTextos({})
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
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Turno</label>
            <Select value={turno} onChange={(e) => setTurno(e.target.value)}>
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
          return (
            <div key={id} className="mb-3">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Reporte de {modelo?.stage_name}</label>
              <textarea
                value={textos[id] || ''}
                onChange={(e) => setTextos((t) => ({ ...t, [id]: e.target.value }))}
                placeholder={`¿Cómo fue el turno con ${modelo?.stage_name}? Ventas, fans importantes, pendientes, incidencias...`}
                rows={3}
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          )
        })}

        {error && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        {ok && <p className="text-sm mb-2" style={{ color: 'var(--success)' }}>{ok}</p>}
        <Button onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar reporte'}</Button>
      </Panel>

      <Panel className="p-5">
        <p className="text-sm font-medium mb-4">Reportes del equipo</p>
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
                    <tr key={r.id} onClick={() => verDetalle(r)} className="cursor-pointer hover:opacity-80" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2">{fmtFecha(r.fecha)}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          {T_NAME(r.turno)}
                        </span>
                      </td>
                      <td className="px-3 py-2"><strong>{r.profiles?.full_name}</strong></td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-muted)' }}>{abierto === r.id ? '▲' : '▼'}</td>
                    </tr>
                    {abierto === r.id && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={5} className="px-3 py-3" style={{ background: 'var(--panel-alt)' }}>
                          {(detalles[r.id] || []).length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
                          ) : (
                            (detalles[r.id] || []).map((d) => (
                              <div key={d.id} className="mb-2">
                                <strong style={{ color: 'var(--accent)' }}>{d.models?.stage_name}</strong>
                                <div className="whitespace-pre-wrap">{d.texto}</div>
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
