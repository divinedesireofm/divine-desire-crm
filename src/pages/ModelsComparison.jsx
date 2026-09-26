import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader, DeltaBadge } from '../components/ui'

const COLORES = ['var(--accent)', 'var(--gold)', 'var(--success)', 'var(--danger)', '#a78bfa', '#38bdf8']

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) }

export default function ModelsComparison() {
  const [modelos, setModelos] = useState([])
  const [seleccionadas, setSeleccionadas] = useState([])
  const [datosPorModelo, setDatosPorModelo] = useState({}) // { model_id: [ {week_start, ...}, ... ] }
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('models').select('id, stage_name').order('stage_name').then(({ data }) => setModelos(data || []))
  }, [])

  function toggle(id) {
    setSeleccionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : s.concat([id])))
  }

  useEffect(() => {
    async function cargar() {
      if (seleccionadas.length === 0) { setDatosPorModelo({}); return }
      setLoading(true)
      const resultados = {}
      await Promise.all(seleccionadas.map(async (id) => {
        const { data } = await supabase.from('weekly_metrics').select('*').eq('model_id', id).order('week_start', { ascending: true })
        resultados[id] = data || []
      }))
      setDatosPorModelo(resultados)
      setLoading(false)
    }
    cargar()
  }, [seleccionadas])

  // Fusiona las semanas de todas las modelos seleccionadas en un único eje temporal para la gráfica
  const semanasUnicas = Array.from(new Set(Object.values(datosPorModelo).flat().map((r) => r.week_start))).sort()
  const chartData = semanasUnicas.map((week) => {
    const fila = { week }
    seleccionadas.forEach((id) => {
      const nombre = modelos.find((m) => m.id === id)?.stage_name || id
      const row = (datosPorModelo[id] || []).find((r) => r.week_start === week)
      fila[nombre] = row ? Number(row.billing_total ?? row.of_net_sales) || 0 : null
    })
    return fila
  })

  return (
    <div>
      <PageHeader title="Comparativa entre modelos" subtitle="Elige hasta 6 modelos para verlas una al lado de otra." />

      <Panel className="p-5 mb-6">
        <div className="flex flex-wrap gap-2">
          {modelos.map((m) => {
            const on = seleccionadas.includes(m.id)
            return (
              <button
                key={m.id} onClick={() => toggle(m.id)}
                className="px-3 py-1.5 rounded-full text-sm"
                style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
              >
                {m.stage_name}
              </button>
            )
          })}
        </div>
      </Panel>

      {loading && <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Cargando…</p>}

      {seleccionadas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Selecciona al menos una modelo arriba para empezar.</p>
      ) : (
        <>
          {chartData.length > 1 && (
            <Panel className="p-5 mb-6">
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Facturación por semana ($)</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend />
                  {seleccionadas.map((id, i) => {
                    const nombre = modelos.find((m) => m.id === id)?.stage_name || id
                    return <Line key={id} type="monotone" dataKey={nombre} stroke={COLORES[i % COLORES.length]} strokeWidth={2} dot={false} connectNulls />
                  })}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}

          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Modelo', 'Facturación (últ. semana)', 'Subs nuevas', 'Renovaciones', 'Tips', 'ARPU', 'Alcance IG'].map((c) => (
                      <th key={c} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seleccionadas.map((id) => {
                    const nombre = modelos.find((m) => m.id === id)?.stage_name || id
                    const filas = datosPorModelo[id] || []
                    const ult = filas[filas.length - 1]
                    const ant = filas[filas.length - 2]
                    if (!ult) {
                      return (
                        <tr key={id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-4 py-3"><strong>{nombre}</strong></td>
                          <td colSpan={6} className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos todavía</td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3"><strong>{nombre}</strong></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span>${fmtEs(ult.billing_total ?? ult.of_net_sales)}</span>
                            <DeltaBadge actual={ult.billing_total ?? ult.of_net_sales} anterior={ant?.billing_total ?? ant?.of_net_sales} />
                          </div>
                        </td>
                        <td className="px-4 py-3">{fmtEs(ult.of_subs_new)}</td>
                        <td className="px-4 py-3">{fmtEs(ult.renewals_count)}</td>
                        <td className="px-4 py-3">${fmtEs(ult.of_tips)}</td>
                        <td className="px-4 py-3">${fmtEs(ult.arpu)}</td>
                        <td className="px-4 py-3">{fmtEs(ult.ig_reach)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
