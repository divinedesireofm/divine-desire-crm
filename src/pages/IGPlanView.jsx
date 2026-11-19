import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { textoPlan, textoDia, textoPeriodo } from './IGPlans'
import VideoReel from '../components/VideoReel'
import TextoConLinks from '../components/TextoConLinks'
import ImagenesReel from '../components/ImagenesReel'

const nOrigen = (id) => (id === 'ganador' ? 'Ganador' : 'Nuevo')
const nTipo = (id) => (id === 'marca_personal' ? 'Marca personal' : 'Sugerente')
const esUrl = (t) => /^https?:\/\//i.test(String(t || '').trim())

// Contenido de una planificación en solo lectura (se muestra desplegado dentro de la lista)
// paraModelo: la modelo marca «hecho» y no ve «subido». paraAsistente: el asistente marca «subido» y no ve «hecho». Sin ninguno (admin, manager, planner): ve los dos, sin poder marcar.
export default function PlanContenido({ plan, usuario, linkPlan, paraModelo = false, paraAsistente = false, onHechos = null }) {
  const texto = useMemo(() => textoPlan(plan, usuario || 'cuenta'), [plan, usuario])
  const lbl = { color: 'var(--text-muted)' }
  // Reels marcados como hechos por la modelo: ella los marca; el equipo los ve
  const [hechos, setHechos] = useState({}) // { 'dia:reel': fecha }
  const [errHecho, setErrHecho] = useState('')
  const [editados, setEditados] = useState({}) // { 'dia:reel': fecha } reels editados por el asistente
  useEffect(() => {
    let vivo = true
    if (paraAsistente) return undefined   // el asistente no ve los «hechos» de la modelo
    const q = paraModelo ? supabase.rpc('mis_reels_hechos') : supabase.from('plan_reels_hechos').select('plan_id, dia, reel, hecho_at').eq('plan_id', plan.id)
    Promise.resolve(q).then(({ data }) => {
      if (!vivo) return
      const m = {}; (data || []).filter((h) => h.plan_id === plan.id).forEach((h) => { m[h.dia + ':' + h.reel] = h.hecho_at }); setHechos(m)
    }).catch(() => {})
    return () => { vivo = false }
  }, [plan.id, paraModelo, paraAsistente])
  // Reels editados (los ven el asistente y el equipo de gestión; la modelo no)
  useEffect(() => {
    if (paraModelo) return undefined
    let vivo = true
    Promise.resolve(supabase.from('plan_reels_editados').select('plan_id, dia, reel, editado_at').eq('plan_id', plan.id)).then(({ data }) => {
      if (!vivo || !data) return
      const m = {}; data.forEach((h) => { m[h.dia + ':' + h.reel] = h.editado_at }); setEditados(m)
    }).catch(() => {})
    return () => { vivo = false }
  }, [plan.id, paraModelo])
  // El equipo ve los checks casi en directo: se refrescan solos mientras la planificación está abierta
  useEffect(() => {
    if (paraModelo) return undefined
    const t = setInterval(() => {
      if (!paraAsistente) Promise.resolve(supabase.from('plan_reels_hechos').select('plan_id, dia, reel, hecho_at').eq('plan_id', plan.id)).then(({ data }) => {
        if (!data) return
        const m = {}; data.forEach((h) => { m[h.dia + ':' + h.reel] = h.hecho_at }); setHechos(m)
      }).catch(() => {})
      Promise.resolve(supabase.from('plan_reels_editados').select('plan_id, dia, reel, editado_at').eq('plan_id', plan.id)).then(({ data }) => {
        if (!data) return
        const m = {}; data.forEach((h) => { m[h.dia + ':' + h.reel] = h.editado_at }); setEditados(m)
      }).catch(() => {})
    }, 20000)
    return () => clearInterval(t)
  }, [plan.id, paraModelo, paraAsistente])
  async function marcarEditado(di, ri) {
    const k = di + ':' + ri; const ya = !!editados[k]
    setErrHecho('')
    setEditados((h) => { const n = { ...h }; if (ya) delete n[k]; else n[k] = new Date().toISOString(); return n })
    const { error } = await supabase.rpc('marcar_reel_editado', { p_plan: plan.id, p_dia: di, p_reel: ri, p_editado: !ya })
    if (error) { setErrHecho('No se pudo guardar el cambio. Inténtalo de nuevo.'); setEditados((h) => { const n = { ...h }; if (ya) n[k] = new Date().toISOString(); else delete n[k]; return n }) }
  }
  async function marcar(di, ri) {
    const k = di + ':' + ri; const ya = !!hechos[k]
    setErrHecho('')
    setHechos((h) => { const n = { ...h }; if (ya) delete n[k]; else n[k] = new Date().toISOString(); return n })
    const { error } = await supabase.rpc('marcar_reel_hecho', { p_plan: plan.id, p_dia: di, p_reel: ri, p_hecho: !ya })
    if (error) { setErrHecho('No se pudo guardar el cambio. Inténtalo de nuevo.'); setHechos((h) => { const n = { ...h }; if (ya) n[k] = new Date().toISOString(); else delete n[k]; return n }) }
    else if (onHechos) onHechos(plan.id, di + ':' + ri, !ya)
  }
  const fmtH = (ts) => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const total = (plan.dias || []).reduce((a, d) => a + (d.reels?.length || 0), 0)
  const hechosN = Object.keys(hechos).length
  const editadosN = Object.keys(editados).length
  const hecho = (k) => (paraAsistente ? !!editados[k] : paraModelo ? !!hechos[k] : !!hechos[k] && !!editados[k])   // reel «completo» según quien mira
  return (
    <div>
      {total > 0 && (
        <p className="text-sm mb-3 flex flex-wrap gap-x-5 gap-y-1" data-progreso>
          {!paraAsistente && <span data-progreso-hechos>✅ {paraModelo ? 'Reels hechos' : 'Hechos por la modelo'}: <strong>{hechosN}/{total}</strong></span>}
          {!paraModelo && <span data-progreso-editados>⬆️ Subidos: <strong>{editadosN}/{total}</strong></span>}
        </p>
      )}
      {errHecho && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{errHecho}</p>}
      <div className="flex flex-wrap gap-2 mb-3">
        {!paraModelo && <CopyButton text={linkPlan} label="🔗 Copiar link de esta planificación" />}
        <CopyButton text={texto} label="Copiar texto" />
      </div>
      {(plan.periodo_desde || plan.periodo_hasta) && <p className="text-sm mb-3">📅 <strong>Planificación del</strong> {textoPeriodo(plan)}</p>}
      {plan.reglas?.trim() && (
        <Panel className="p-4 mb-4">
          <p className="text-xs mb-1" style={lbl}>Reglas / avisos</p>
          <p className="text-sm whitespace-pre-wrap"><TextoConLinks texto={plan.reglas} /></p>
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
                <div key={ri} className="rounded-md p-3 text-sm" style={{ background: 'var(--panel-alt)', border: `1px solid ${hecho(di + ':' + ri) ? 'var(--success, #30a46c)' : 'var(--border)'}` }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--gold, var(--accent))' }}>
                      {hecho(di + ':' + ri) ? '✅ ' : ''}{nOrigen(r.origen)} · {nTipo(r.tipo)}{r.fuente === 'original' ? ' · 💡 Idea original' : ''}{r.prueba ? ' · 🧪 Prueba' : ''}{r.aire_libre ? ' · 🌳 Al aire libre' : ''}
                    </p>
                    {paraModelo ? (
                      <button type="button" onClick={() => marcar(di, ri)} data-hecho={di + ':' + ri} className="text-sm px-4 py-2 rounded-full w-full sm:w-auto"
                        style={{ background: hechos[di + ':' + ri] ? 'var(--success, #30a46c)' : 'transparent', color: hechos[di + ':' + ri] ? '#fff' : 'var(--text)', border: '1px solid var(--success, #30a46c)' }}>
                        {hechos[di + ':' + ri] ? `✓ Hecho · ${fmtH(hechos[di + ':' + ri])}` : 'Marcar como hecho'}
                      </button>
                    ) : paraAsistente ? (
                      <button type="button" onClick={() => marcarEditado(di, ri)} data-editado={di + ':' + ri} className="text-xs px-2.5 py-1 rounded-full"
                        style={{ background: editados[di + ':' + ri] ? 'var(--success, #30a46c)' : 'transparent', color: editados[di + ':' + ri] ? '#fff' : 'var(--text)', border: '1px solid var(--success, #30a46c)' }}>
                        {editados[di + ':' + ri] ? `✓ Subido · ${fmtH(editados[di + ':' + ri])}` : 'Marcar como subido'}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 flex-wrap">
                        <span data-check-modelo={di + ':' + ri} className="text-xs px-2 py-0.5 rounded-full" style={hechos[di + ':' + ri] ? { background: 'var(--success, #30a46c)', color: '#fff' } : { border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          {hechos[di + ':' + ri] ? `✓ Modelo: hecho · ${fmtH(hechos[di + ':' + ri])}` : '☐ Modelo: pendiente'}
                        </span>
                        <span data-check-editado={di + ':' + ri} className="text-xs px-2 py-0.5 rounded-full" style={editados[di + ':' + ri] ? { background: 'var(--success, #30a46c)', color: '#fff' } : { border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          {editados[di + ':' + ri] ? `✓ Subido · ${fmtH(editados[di + ':' + ri])}` : '☐ Subido: pendiente'}
                        </span>
                      </span>
                    )}
                  </div>
                  {r.tematica?.trim() && <p className="mb-1">🎯 <strong>Temática:</strong> <TextoConLinks texto={r.tematica} /></p>}
                  {r.fuente === 'original' && r.idea?.trim() && (
                    <div className="rounded-md p-3 mb-2 whitespace-pre-wrap" style={{ border: '1px solid var(--gold, var(--accent))', background: 'var(--accent-soft)' }} data-idea-vista>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--gold, var(--accent))' }}>💡 Idea original</p>
                      <TextoConLinks texto={r.idea} />
                    </div>
                  )}
                  {r.fuente !== 'original' && r.link?.trim() && (
                    <p className="mb-1 flex items-center gap-2 flex-wrap">
                      <span>🔗</span>
                      {esUrl(r.link)
                        ? <a href={r.link.trim()} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: 'var(--accent)' }}>{r.link.trim()}</a>
                        : <span className="break-all">{r.link.trim()}</span>}
                      <CopyButton text={r.link.trim()} label="Copiar link" />
                    </p>
                  )}
                  {r.video?.path && <VideoReel video={r.video} soloLectura />}
                  <ImagenesReel imagenes={r.imagenes || []} />
                  {paraModelo && (
                    <p className="mt-2 mb-1 text-sm font-medium rounded-md px-3 py-2" data-lugar-reel={r.aire_libre ? 'aire_libre' : 'interior'}
                      style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                      {r.aire_libre ? '🌳 Este reel se graba al aire libre' : '🏠 Este reel NO es al aire libre (se graba en interior)'}
                    </p>
                  )}
                  {r.gancho?.trim() && <p className="mb-1 mt-1 whitespace-pre-wrap">🎣 <TextoConLinks texto={r.gancho} /></p>}
                  {r.texto?.trim() && <p className="whitespace-pre-wrap">📝 <TextoConLinks texto={r.texto} /></p>}
                  {r.edicion?.trim() && <p className="whitespace-pre-wrap mt-1">📹 <strong>Edición:</strong> <TextoConLinks texto={r.edicion} /></p>}
                  {!r.tematica?.trim() && !r.link?.trim() && !r.idea?.trim() && !(r.imagenes || []).length && !r.gancho?.trim() && !r.texto?.trim() && !r.edicion?.trim() && !r.video?.path && <p style={lbl}>Sin contenido todavía.</p>}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
