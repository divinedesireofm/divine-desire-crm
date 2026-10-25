import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { textoPlan, textoDia } from './IGPlans'

const nOrigen = (id) => (id === 'ganador' ? 'Ganador' : 'Nuevo')
const nTipo = (id) => (id === 'marca_personal' ? 'Marca personal' : 'Sugerente')
const sinArroba = (u) => String(u || '').replace(/^@/, '')
const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const esUrl = (t) => /^https?:\/\//i.test(String(t || '').trim())

// Vista de solo lectura de una planificación: se abre directamente desde un link, sin entrar a editarla
export default function IGPlanView() {
  const { id } = useParams()
  const [plan, setPlan] = useState(null)
  const [usuario, setUsuario] = useState('')
  const [estado, setEstado] = useState('cargando') // cargando | ok | noexiste
  const linkPlan = `${window.location.origin}/planificaciones/${id}`

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('ig_plans').select('*').eq('id', id).maybeSingle()
      if (!vivo) return
      if (!data) { setEstado('noexiste'); return }
      const { data: c } = await supabase.from('instagram_accounts').select('username').eq('id', data.account_id).maybeSingle()
      if (!vivo) return
      setPlan(data); setUsuario(c?.username || ''); setEstado('ok')
    })()
    return () => { vivo = false }
  }, [id])

  const texto = useMemo(() => (plan ? textoPlan(plan, usuario || 'cuenta') : ''), [plan, usuario])
  const lbl = { color: 'var(--text-muted)' }

  if (estado === 'cargando') return <p className="text-sm" style={lbl}>Cargando…</p>
  if (estado === 'noexiste') return (
    <div>
      <Link to="/planificaciones" className="text-sm underline">← Volver a planificaciones</Link>
      <Panel className="p-6 mt-4 text-sm" style={lbl}>No se encuentra esta planificación (puede que se haya borrado o que no tengas acceso).</Panel>
    </div>
  )

  return (
    <div>
      <Link to="/planificaciones" className="text-sm underline">← Volver a planificaciones</Link>
      <div className="mt-3">
        <PageHeader
          title={`Reels @${sinArroba(usuario)} · ${plan.titulo || ''}`}
          subtitle={`Creada el ${fmtExacta(plan.created_at)}${plan.enviado_at ? ` · ✓ Enviada el ${fmtExacta(plan.enviado_at)}` : ''}${plan.estado === 'borrador' ? ' · Borrador' : ''}`}
          action={<div className="flex flex-wrap gap-2"><CopyButton text={linkPlan} label="🔗 Copiar link de esta planificación" /><CopyButton text={texto} label="Copiar texto" /></div>}
        />
      </div>

      <Panel className="p-3 mb-4 text-sm flex items-center gap-2 flex-wrap">
        <span style={lbl}>Link:</span>
        <a href={linkPlan} className="underline break-all" style={{ color: 'var(--accent)' }}>{linkPlan}</a>
      </Panel>

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
