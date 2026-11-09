import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AVISO_MINUTOS, horaDoble, turnoDe, urlImagenMasivo } from '../lib/masivos'
import CopyButton from './CopyButton'
import ModelName from './ModelAvatar'
import { Button } from './ui'

function Foto({ path }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let vivo = true; urlImagenMasivo(path).then((u) => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [path])
  if (!url) return null
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Contenido del masivo" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} /></a>
}

// Aviso en mitad de pantalla: sale cuando llega la hora (o minutos antes) y NO se puede quitar hasta marcar el masivo como enviado.
// El estado vive en la base de datos, así que sigue ahí aunque se cierre y se vuelva a abrir el CRM.
export default function MasivoGate() {
  const { profile } = useAuth()
  const [pend, setPend] = useState([])
  const [nombres, setNombres] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const cargar = useCallback(async () => {
    if (!profile) return
    const limite = new Date(Date.now() + AVISO_MINUTOS * 60000).toISOString()
    const { data, error } = await supabase.from('massive_calendar').select('*')
      .eq('chatter_id', profile.id).is('enviado_at', null).not('enviar_en', 'is', null).lte('enviar_en', limite).order('enviar_en')
    if (error) return
    const filas = data || []
    setPend(filas)
    const ids = Array.from(new Set(filas.map((f) => f.modelo_id).filter(Boolean)))
    if (ids.length) {
      const { data: ms } = await supabase.from('models').select('id, stage_name').in('id', ids)
      setNombres(Object.fromEntries((ms || []).map((m) => [m.id, m.stage_name])))
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return undefined
    cargar()
    const t = setInterval(cargar, 20000)
    const vis = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [profile, cargar])

  if (!pend.length) return null
  const m = pend[0]
  const t = turnoDe(m.turno)
  const tarde = new Date(m.enviar_en).getTime() < Date.now()

  async function enviado() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('marcar_masivo_enviado', { p_id: m.id })
    setBusy(false)
    if (error) { setErr('No se pudo marcar como enviado. Inténtalo de nuevo.'); return }
    setPend((p) => p.filter((x) => x.id !== m.id))
    cargar()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Masivo listo para enviar" className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-w-xl rounded-xl p-5 overflow-y-auto" style={{ maxHeight: '92vh', background: 'var(--panel)', border: `2px solid ${t?.color || 'var(--accent)'}` }}>
        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: t?.color || 'var(--gold)' }}>
          {tarde ? '¡Toca enviar este masivo ya!' : 'Masivo a punto de enviarse'}{pend.length > 1 ? ` · ${pend.length} pendientes` : ''}
        </p>
        <h2 className="text-lg font-display font-semibold mb-1">
          {m.formato || 'Masivo'} · para <ModelName name={nombres[m.modelo_id] || '—'} size={20} />
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          {t ? `Turno de ${t.label.toLowerCase()} · ` : ''}{horaDoble(m.enviar_en)}
        </p>
        {m.imagen_path && <div className="mb-3"><Foto path={m.imagen_path} /></div>}
        <div className="rounded-md p-3 mb-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', userSelect: 'all' }}>
          {m.mensaje || m.nota || '(sin mensaje)'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={m.mensaje || m.nota || ''} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cópialo, pégalo en el chat de la modelo y márcalo como enviado.</span>
        </div>
        {err && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{err}</p>}
        <Button onClick={enviado} disabled={busy} className="w-full mt-4">{busy ? 'Guardando…' : '✓ Ya lo he enviado'}</Button>
      </div>
    </div>
  )
}
