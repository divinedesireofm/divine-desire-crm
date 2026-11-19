import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'
import PlanContenido from './IGPlanView'

const fmtExacta = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const totalReels = (p) => (p.dias || []).reduce((a, d) => a + (d.reels?.length || 0), 0)

// Frase del día: una distinta cada día (según la fecha), igual para todo el día
const FRASES = [
  'Cada reel que grabas hoy es un paso más hacia el crecimiento que quieres. 💪',
  'No tiene que ser perfecto, tiene que estar hecho. ¡Tú puedes con esto! ✨',
  'La constancia es lo que separa a las cuentas que crecen de las que se quedan atrás. 🚀',
  'Tu contenido tiene algo que nadie más tiene: a ti. Enséñalo con confianza. 💙',
  'Un reel hoy, otro mañana… así se construye una cuenta que vende. 🔥',
  'Respira, enfócate en el siguiente reel y deja que la magia haga el resto. 🌟',
  'Hoy es un buen día para sorprenderte de lo que eres capaz de hacer. 🎬',
  'Las que triunfan no esperan a sentirse con ganas: empiezan y las ganas llegan. 😉',
  'Cada vídeo grabado es un vídeo que puede cambiar tu mes. ¡Vamos! 💫',
  'Estás más cerca de tu objetivo que ayer. Sigue sumando. 🏆',
  'Confía en el proceso: lo que hoy parece poco, mañana se nota mucho. 🌱',
  'Tú pones la cara y el equipo pone todo lo demás. ¡Juntos llegamos más lejos! 🤝',
  'Disfruta grabando: se nota en pantalla cuando lo pasas bien. 😊',
  'Un pequeño esfuerzo hoy, una gran diferencia en tus resultados. ¡Adelante! ⭐',
]
const fraseDelDia = (d = new Date()) => FRASES[Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000) % FRASES.length]

// Aliento según cuánto lleva hecho de lo pendiente
function alientoPorProgreso(h, t, hayPlanes) {
  if (!hayPlanes) return null
  if (t === 0) return '🎉 ¡Lo tienes todo al día! Eres una crack, descansa y disfruta.'
  const pct = h / t
  if (h === 0) return '👉 Empieza por el primer reel: lo más difícil es arrancar, y ya estás aquí.'
  if (pct < 0.4) return '👏 ¡Buen comienzo! Ya has arrancado, ahora a coger ritmo.'
  if (pct < 0.7) return '🔥 ¡Vas genial! Ya llevas bastante, sigue así que lo estás clavando.'
  if (pct < 1) return '🚀 ¡Casi lo tienes! Te quedan muy pocos reels, ¡último empujón!'
  return '🎉 ¡Lo has conseguido! Todo hecho, eres increíble. 💙'
}

// Vista de la modelo (pensada para el móvil): sus planificaciones enviadas, separadas en «Por hacer» y «Hechas».
// Una planificación pasa sola a «Hechas» cuando la modelo marca todos sus reels (o si el equipo la dio por hecha).
export default function ReelsModelo({ modo = 'modelo' }) {
  const asist = modo === 'asistente'   // asistente de Instagram: misma interfaz, pero marca «subido» en vez de «hecho»
  const V = asist ? { hechos: 'subidos', hecho: 'subido', Hechas: 'Subidos', porHacer: 'por subir' } : { hechos: 'hechos', hecho: 'hecho', Hechas: 'Hechas', porHacer: 'por hacer' }
  const [planes, setPlanes] = useState([])
  const [hechos, setHechos] = useState({}) // { planId: { 'dia:reel': true } }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [vista, setVista] = useState('porhacer')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const cargaPlanes = asist
      ? Promise.all([
        supabase.from('ig_plans').select('id, account_id, titulo, reglas, mostrar_resumen, dias, enviado_at, periodo_desde, periodo_hasta, hecha_at, estado').not('enviado_at', 'is', null).neq('estado', 'borrador').order('enviado_at', { ascending: false }).limit(60),
        supabase.from('instagram_accounts').select('id, username'),
        supabase.from('plan_reels_editados').select('plan_id, dia, reel'),
      ]).then(([{ data, error: e1 }, { data: cu }, { data: ed }]) => {
        const nom = Object.fromEntries((cu || []).map((c) => [c.id, c.username]))
        return [{ data: (data || []).filter((p) => p.enviado_at && p.estado !== 'borrador').map((p) => ({ ...p, usuario: nom[p.account_id] || '' })), error: e1 }, { data: ed }]
      })
      : Promise.all([supabase.rpc('mis_planificaciones'), supabase.rpc('mis_reels_hechos')])
    cargaPlanes.then(([{ data, error: err }, { data: h }]) => {
      if (err) setError('No se pudieron cargar tus planificaciones.')
      const m = {}
      ;(h || []).forEach((x) => { (m[x.plan_id] = m[x.plan_id] || {})[x.dia + ':' + x.reel] = true })
      setHechos(m)
      const lista = data || []
      setPlanes(lista)
      const pend = lista.find((p) => !completa(p, m))
      if (pend) setAbierto(pend.id)
      else if (lista.length) setVista('hechas')
      setLoading(false)
    })
  }, [])

  const hechosDe = (id, m = hechos) => Object.keys(m[id] || {}).length
  function completa(p, m = hechos) {
    if (p.hecha_at) return true
    const t = totalReels(p)
    return t > 0 && hechosDe(p.id, m) >= t
  }

  const porHacer = useMemo(() => planes.filter((p) => !completa(p)), [planes, hechos])
  const hechas = useMemo(() => planes.filter((p) => completa(p)), [planes, hechos])
  const lista = vista === 'porhacer' ? porHacer : hechas

  // Progreso global de lo pendiente (para el mensaje de ánimo)
  const totPend = porHacer.reduce((a, p) => a + totalReels(p), 0)
  const hechPend = porHacer.reduce((a, p) => a + Math.min(hechosDe(p.id), totalReels(p)), 0)
  const aliento = asist ? null : alientoPorProgreso(hechPend, totPend, planes.length > 0)
  const pctGlobal = totPend ? Math.round((hechPend / totPend) * 100) : 100

  // Cuando la modelo marca o desmarca un reel, se actualiza el recuento y, si cambia de estado, la planificación se mueve de pestaña
  function alCambiar(planId, clave, hecho) {
    const plan = planes.find((p) => p.id === planId)
    const antes = plan ? completa(plan) : false
    const nuevo = { ...hechos, [planId]: { ...(hechos[planId] || {}) } }
    if (hecho) nuevo[planId][clave] = true; else delete nuevo[planId][clave]
    setHechos(nuevo)
    const despues = plan ? completa(plan, nuevo) : false
    if (plan && antes !== despues) {
      setAbierto(null)
      setToast(despues ? (asist ? '✅ ¡Planificación completada! Ahora está en «Subidos».' : '🎉 ¡Planificación completada! Ahora está en «Hechas».') : (asist ? 'Planificación devuelta a «Por subir».' : 'Planificación devuelta a «Por hacer».'))
      setTimeout(() => setToast(''), 4500)
    }
  }

  return (
    <div>
      <PageHeader title="Planificaciones" subtitle={asist ? 'Planificaciones enviadas: mira qué reels hay que editar y cómo, y marca cada uno al subirlo.' : 'Tus reels listos para grabar. Marca cada uno al hacerlo.'} />
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !asist && (
        <Panel className="p-4 mb-4" data-motivacion style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
          <p className="text-sm font-medium" data-frase-dia>{fraseDelDia()}</p>
          {aliento && (
            <>
              <p className="text-sm mt-2" data-aliento>{aliento}</p>
              {totPend > 0 && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }} data-progreso-global>Llevas {hechPend} de {totPend} reels pendientes ({pctGlobal}%)</p>}
            </>
          )}
        </Panel>
      )}
      {toast && <p className="text-sm mb-3 rounded-md px-3 py-2" data-toast-plan style={{ background: 'var(--accent-soft)', color: 'var(--success, #30a46c)', border: '1px solid var(--success, #30a46c)' }}>{toast}</p>}

      <div className="grid grid-cols-2 gap-2 mb-4" role="tablist">
        {[['porhacer', asist ? 'Por subir' : 'Por hacer', porHacer.length], ['hechas', V.Hechas, hechas.length]].map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} data-pestana-modelo={id} onClick={() => setVista(id)}
            className="rounded-xl py-3 text-sm font-medium"
            style={{ background: vista === id ? 'var(--accent)' : 'var(--panel)', color: vista === id ? '#0B1020' : 'var(--text)', border: `1px solid ${vista === id ? 'var(--accent)' : 'var(--border)'}` }}>
            {id === 'hechas' ? (asist ? '⬆️ ' : '✅ ') : '📝 '}{label} <span data-contador={id}>({n})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p></Panel>
      ) : planes.length === 0 ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>{asist ? 'Todavía no hay planificaciones enviadas. Cuando el equipo envíe una a la modelo, aparecerá aquí.' : 'Todavía no tienes ninguna planificación. Cuando el equipo te envíe una, aparecerá aquí.'}</p></Panel>
      ) : lista.length === 0 ? (
        <Panel><p className="p-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>{vista === 'porhacer' ? (asist ? '🎉 No hay nada pendiente de subir.' : '🎉 No tienes nada pendiente. Todas tus planificaciones están hechas.') : (asist ? 'Aún no hay ninguna planificación con todos los reels subidos.' : 'Aún no has completado ninguna planificación. Cuando marques todos sus reels, aparecerá aquí.')}</p></Panel>
      ) : lista.map((p) => {
        const on = abierto === p.id
        const t = totalReels(p)
        const h = p.hecha_at && !hechosDe(p.id) ? t : hechosDe(p.id)
        const pct = t ? Math.min(100, Math.round((h / t) * 100)) : 0
        return (
          <Panel key={p.id} className="p-4 sm:p-5 mb-3" data-plan-modelo={p.id}>
            <button onClick={() => setAbierto(on ? null : p.id)} className="w-full text-left flex items-start justify-between gap-3" aria-expanded={on}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">@{String(p.usuario || '').replace(/^@/, '')} · {p.titulo}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Enviada el {fmtExacta(p.enviado_at)} · {(p.dias || []).length} {(p.dias || []).length === 1 ? 'día' : 'días'}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mt-1.5" data-resumen-reels={p.id}>
                  <span>🎬 <strong>{t}</strong> {t === 1 ? 'reel' : 'reels'}</span>
                  <span style={{ color: 'var(--success, #30a46c)' }}>{asist ? '⬆️' : '✅'} <strong>{h}</strong> {h === 1 ? V.hecho : V.hechos}</span>
                  {t - h > 0 && <span style={{ color: 'var(--text-muted)' }}>⏳ <strong>{t - h}</strong> {V.porHacer}</span>}
                </span>
                {t > 0 && (
                  <span className="flex items-center gap-2 mt-2">
                    <span className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                      <span className="block h-full" data-barra={p.id} style={{ width: pct + '%', background: 'var(--success, #30a46c)' }} />
                    </span>
                    <span className="text-xs tabular-nums whitespace-nowrap" data-progreso-card={p.id} style={{ color: 'var(--text-muted)' }}>{h}/{t}</span>
                  </span>
                )}
              </span>
              <span className="text-xs underline shrink-0 pt-0.5" style={{ color: 'var(--text-muted)' }}>{on ? 'Ocultar' : 'Ver'}</span>
            </button>
            {on && <div className="mt-4"><PlanContenido plan={p} usuario={p.usuario} paraModelo={!asist} paraAsistente={asist} onHechos={alCambiar} /></div>}
          </Panel>
        )
      })}
    </div>
  )
}
