import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Select, PageHeader, DeltaBadge } from '../components/ui'

function fmtEs(n) { return n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 }) }

export default function OFHealth() {
  const [semanas, setSemanas] = useState([])
  const [semana, setSemana] = useState('')
  const [datos, setDatos] = useState(null)
  const [datosAnterior, setDatosAnterior] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadSemanas() {
    const { data } = await supabase.from('weekly_metrics').select('week_start').order('week_start', { ascending: false })
    const unicas = Array.from(new Set((data || []).map((r) => r.week_start)))
    setSemanas(unicas)
    if (unicas.length && !semana) setSemana(unicas[0])
  }
  useEffect(() => { loadSemanas() }, [])

  async function calcular(weekStart) {
    const { data } = await supabase.from('weekly_metrics').select('*').eq('week_start', weekStart)
    if (!data?.length) return null
    const suma = (campo) => data.reduce((s, r) => s + (Number(r[campo]) || 0), 0)
    const facturacion = suma('billing_total') || suma('of_net_sales')
    const tips = suma('of_tips')
    const subsNuevas = suma('of_subs_new')
    const renovaciones = suma('renewals_count')
    const renovacionActivada = suma('renewal_activated_count')
    const fansActivos = suma('active_fans')
    return {
      modelos: data.length,
      facturacion, tips,
      tipsPct: facturacion ? (tips / facturacion) * 100 : null,
      subsNuevas, renovaciones, renovacionActivada, fansActivos,
      arpuMedio: fansActivos ? facturacion / fansActivos : null,
    }
  }

  useEffect(() => {
    async function run() {
      if (!semana) return
      setLoading(true)
      const idx = semanas.indexOf(semana)
      const anterior = semanas[idx + 1]
      const [d, dAnt] = await Promise.all([calcular(semana), anterior ? calcular(anterior) : null])
      setDatos(d); setDatosAnterior(dAnt)
      setLoading(false)
    }
    run()
  }, [semana, semanas])

  return (
    <div>
      <PageHeader title="Salud OF" subtitle="Ratios agregados de toda la agencia, no de una modelo en concreto." />

      <div className="mb-6 max-w-xs">
        <Select value={semana} onChange={(e) => setSemana(e.target.value)}>
          {semanas.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : !datos ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos para esa semana.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Facturación total ({datos.modelos} modelos)</p>
            <p className="text-2xl font-display font-semibold gold-text">${fmtEs(datos.facturacion)}</p>
            <DeltaBadge actual={datos.facturacion} anterior={datosAnterior?.facturacion} />
          </Panel>
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Tips (% sobre facturación)</p>
            <p className="text-2xl font-display font-semibold" style={{ color: datos.tipsPct >= 8 ? 'var(--success)' : 'var(--danger)' }}>
              {datos.tipsPct !== null ? `${fmtEs(datos.tipsPct)}%` : '—'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Objetivo sano: &gt;8%</p>
          </Panel>
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Fans activos (suma)</p>
            <p className="text-2xl font-display font-semibold gold-text">{fmtEs(datos.fansActivos)}</p>
            <DeltaBadge actual={datos.fansActivos} anterior={datosAnterior?.fansActivos} />
          </Panel>
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Subs nuevas (suma)</p>
            <p className="text-2xl font-display font-semibold gold-text">{fmtEs(datos.subsNuevas)}</p>
            <DeltaBadge actual={datos.subsNuevas} anterior={datosAnterior?.subsNuevas} />
          </Panel>
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Renovaciones / activadas</p>
            <p className="text-2xl font-display font-semibold gold-text">{fmtEs(datos.renovaciones)} / {fmtEs(datos.renovacionActivada)}</p>
          </Panel>
          <Panel className="p-5">
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>ARPU medio de la agencia</p>
            <p className="text-2xl font-display font-semibold gold-text">{datos.arpuMedio !== null ? `$${fmtEs(datos.arpuMedio)}` : '—'}</p>
          </Panel>
        </div>
      )}
    </div>
  )
}
