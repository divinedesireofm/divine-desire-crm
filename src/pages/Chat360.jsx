import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, PageHeader } from '../components/ui'

function hoyISO() { return new Date().toISOString().slice(0, 10) }
function hace14diasISO() { return new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10) }

function horasTrabajadas(eventos) {
  // Empareja entrada -> salida en orden cronológico y suma la duración total (igual que el contador de turno: no se pausa por el break)
  let totalMs = 0
  let entradaAbierta = null
  for (const e of eventos) {
    if (e.tipo === 'entrada') entradaAbierta = new Date(e.created_at)
    if (e.tipo === 'salida' && entradaAbierta) {
      totalMs += new Date(e.created_at) - entradaAbierta
      entradaAbierta = null
    }
  }
  return totalMs / 3600000
}

export default function Chat360() {
  const { profile } = useAuth()
  const [chatters, setChatters] = useState([])
  const [minimos, setMinimos] = useState({}) // chatter_id -> fila
  const [desde, setDesde] = useState(hace14diasISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [datos, setDatos] = useState({}) // chatter_id -> {horas, ventas}
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [formMin, setFormMin] = useState({ minimo_ventas: '', minimo_horas: '' })

  async function loadListas() {
    const cs = await getProfilesByRoles(['manager', 'chatter'])
    setChatters(cs)
    const { data: mins } = await supabase.from('chatter_minimos').select('*').order('vigente_desde', { ascending: false })
    const porChatter = {}
    ;(mins || []).forEach((m) => { if (!porChatter[m.chatter_id]) porChatter[m.chatter_id] = m })
    setMinimos(porChatter)
  }

  async function loadDatos() {
    setLoading(true)
    const finExclusivo = new Date(hasta + 'T23:59:59').toISOString()
    const inicio = new Date(desde + 'T00:00:00').toISOString()

    const [{ data: eventos }, { data: reportes }] = await Promise.all([
      supabase.from('attendance_events').select('chatter_id, tipo, created_at').gte('created_at', inicio).lte('created_at', finExclusivo).order('created_at', { ascending: true }),
      supabase.from('shift_reports').select('id, chatter_id, fecha, shift_report_details(facturacion)').gte('fecha', desde).lte('fecha', hasta),
    ])

    const porChatterEventos = {}
    ;(eventos || []).forEach((e) => { (porChatterEventos[e.chatter_id] = porChatterEventos[e.chatter_id] || []).push(e) })

    const porChatterVentas = {}
    ;(reportes || []).forEach((r) => {
      const suma = (r.shift_report_details || []).reduce((s, d) => s + (Number(d.facturacion) || 0), 0)
      porChatterVentas[r.chatter_id] = (porChatterVentas[r.chatter_id] || 0) + suma
    })

    const resultado = {}
    chatters.forEach((c) => {
      resultado[c.id] = {
        horas: horasTrabajadas(porChatterEventos[c.id] || []),
        ventas: porChatterVentas[c.id] || 0,
      }
    })
    setDatos(resultado)
    setLoading(false)
  }

  useEffect(() => { loadListas() }, [])
  useEffect(() => { if (chatters.length) loadDatos() }, [chatters, desde, hasta])

  function abrirEditar(c) {
    const actual = minimos[c.id]
    setFormMin({ minimo_ventas: actual?.minimo_ventas ?? '', minimo_horas: actual?.minimo_horas ?? '' })
    setEditando(c.id)
  }

  async function guardarMinimo(chatterId) {
    await supabase.from('chatter_minimos').insert([{
      chatter_id: chatterId,
      minimo_ventas: formMin.minimo_ventas ? parseFloat(formMin.minimo_ventas) : null,
      minimo_horas: formMin.minimo_horas ? parseFloat(formMin.minimo_horas) : null,
      creado_por: profile.id,
    }])
    setEditando(null)
    loadListas()
  }

  return (
    <div>
      <PageHeader title="Rendimiento 360" subtitle="Ventas, mínimos y horas trabajadas de cada chatter, en un mismo sitio." />

      <div className="flex gap-2 mb-6 max-w-md">
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Chatter', 'Horas trabajadas', 'Mínimo horas', 'Ventas', 'Mínimo ventas', 'Cumplimiento', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chatters.map((c) => {
                  const d = datos[c.id] || { horas: 0, ventas: 0 }
                  const min = minimos[c.id]
                  const cumpleHoras = !min?.minimo_horas || d.horas >= min.minimo_horas
                  const cumpleVentas = !min?.minimo_ventas || d.ventas >= min.minimo_ventas
                  const cumpleTodo = cumpleHoras && cumpleVentas
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2"><strong>{c.full_name}</strong></td>
                      <td className="px-3 py-2" style={{ color: cumpleHoras ? 'var(--text)' : 'var(--danger)' }}>{d.horas.toFixed(1)} h</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{min?.minimo_horas ? `${min.minimo_horas} h` : '—'}</td>
                      <td className="px-3 py-2" style={{ color: cumpleVentas ? 'var(--text)' : 'var(--danger)' }}>${d.ventas.toFixed(2)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{min?.minimo_ventas ? `$${min.minimo_ventas}` : '—'}</td>
                      <td className="px-3 py-2">
                        {(min?.minimo_horas || min?.minimo_ventas) ? (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: cumpleTodo ? 'var(--success)22' : 'var(--danger)22', color: cumpleTodo ? 'var(--success)' : 'var(--danger)' }}>
                            {cumpleTodo ? 'Cumple' : 'No cumple'}
                          </span>
                        ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin mínimo</span>}
                      </td>
                      <td className="px-3 py-2">
                        {editando === c.id ? (
                          <div className="flex gap-1 items-center">
                            <Input type="number" placeholder="$ mín." value={formMin.minimo_ventas} onChange={(e) => setFormMin({ ...formMin, minimo_ventas: e.target.value })} style={{ width: 80 }} />
                            <Input type="number" placeholder="h mín." value={formMin.minimo_horas} onChange={(e) => setFormMin({ ...formMin, minimo_horas: e.target.value })} style={{ width: 70 }} />
                            <Button onClick={() => guardarMinimo(c.id)}>Guardar</Button>
                          </div>
                        ) : (
                          <button onClick={() => abrirEditar(c)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar mínimos</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
