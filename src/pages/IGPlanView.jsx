import { useMemo } from 'react'
import { Panel } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { textoPlan, textoDia } from './IGPlans'

const nOrigen = (id) => (id === 'ganador' ? 'Ganador' : 'Nuevo')
const nTipo = (id) => (id === 'marca_personal' ? 'Marca personal' : 'Sugerente')
const esUrl = (t) => /^https?:\/\//i.test(String(t || '').trim())

// Contenido de una planificación en solo lectura (se muestra desplegado dentro de la lista)
export default function PlanContenido({ plan, usuario, linkPlan }) {
  const texto = useMemo(() => textoPlan(plan, usuario || 'cuenta'), [plan, usuario])
  const lbl = { color: 'var(--text-muted)' }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <CopyButton text={linkPlan} label="🔗 Copiar link de esta planificación" />
        <CopyButton text={texto} label="Copiar texto" />
      </div>
      {plan.reglas?.trim() && (
        <Panel className="p-4 mb-4">
          <p className="text-xs mb-1" style={lbl}>Reglas / avisos</p>
          <p className="text-sm whitespace-pre-wrap">{plan.reglas}</p>
        </Panel>
      )}

      <div className="space-y-4">
        {(plan.dias || []).map((d, di) => (
          <Panel key={di} className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <p className="font-medium">Día {di + 1}</p>
              <CopyButton text={textoDia(d, di)} label={`Copiar día ${di + 1}`} />
            </div>
            <div className="space-y-3">
              {(d.reels || []).map((r, ri) => (
                <div key={ri} className="rounded-md p-3 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--gold, var(--accent))' }}>
                    {nOrigen(r.origen)} · {nTipo(r.tipo)}{r.prueba ? ' · 🧪 Prueba' : ''}
                  </p>
                  {r.tematica?.trim() && <p className="mb-1">🎯 <strong>Temática:</strong> {r.tematica}</p>}
                  {r.link?.trim() && (
                    <p className="mb-1 flex items-center gap-2 flex-wrap">
                      <span>🔗</span>
                      {esUrl(r.link)
                        ? <a href={r.link.trim()} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: 'var(--accent)' }}>{r.link.trim()}</a>
                        : <span className="break-all">{r.link.trim()}</span>}
                      <CopyButton text={r.link.trim()} label="Copiar link" />
                    </p>
                  )}
                  {r.gancho?.trim() && <p className="mb-1 whitespace-pre-wrap">🎣 {r.gancho}</p>}
                  {r.texto?.trim() && <p className="whitespace-pre-wrap">📝 {r.texto}</p>}
                  {!r.tematica?.trim() && !r.link?.trim() && !r.gancho?.trim() && !r.texto?.trim() && <p style={lbl}>Sin contenido todavía.</p>}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
