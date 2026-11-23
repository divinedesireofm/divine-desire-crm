import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from './ui'
import Icon from './Icon'
import { TURNOS_FAN, traerComprasFans, aplanar, rankingFans } from '../lib/topFans'

const money = (n) => '$' + Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })
const lbl = { color: 'var(--text-muted)' }

// Resumen para el panel general: top 5 de siempre y top 3 de cada turno
export default function TopFansResumen() {
  const [compras, setCompras] = useState(null)
  useEffect(() => {
    let vivo = true
    traerComprasFans().then(({ filas }) => { if (vivo) setCompras(aplanar(filas).compras) })
    return () => { vivo = false }
  }, [])
  const general = useMemo(() => (compras ? rankingFans(compras) : []), [compras])
  const turnos = useMemo(() => (compras ? TURNOS_FAN.map((t) => ({ ...t, lista: rankingFans(compras, { turno: t.id }) })) : []), [compras])

  const fila = (r, i) => (
    <div key={r.user} className="flex items-center gap-2 py-1 text-sm">
      <span className="w-4 text-xs tabular-nums" style={lbl}>{i + 1}</span>
      <span className="min-w-0 flex-1 truncate">{r.user}</span>
      <span className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>{money(r.total)}</span>
    </div>
  )
  return (
    <Panel className="p-5 mb-6" data-top-fans-resumen>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-sm font-medium flex items-center gap-2"><Icon name="diamond" size={16} /> Fans que más han gastado</p>
        <Link to="/top-fans" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Ver ranking completo y filtrar →</Link>
      </div>
      {compras === null ? <p className="text-sm" style={lbl}>Cargando…</p> : general.length === 0 ? <p className="text-sm" style={lbl}>Todavía no hay compras con @usuario y cantidad en los reportes.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div><p className="text-xs mb-1 font-medium" style={lbl}>De siempre · top 5</p>{general.slice(0, 5).map(fila)}</div>
          {turnos.map((t) => <div key={t.id}><p className="text-xs mb-1 font-medium" style={lbl}>{t.n} · top 3</p>{t.lista.length ? t.lista.slice(0, 3).map(fila) : <p className="text-sm" style={lbl}>Sin compras</p>}</div>)}
        </div>
      )}
    </Panel>
  )
}
