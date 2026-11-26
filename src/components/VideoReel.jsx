import { useEffect, useRef, useState } from 'react'
import { urlVideo, descargarVideo, MAX_MB } from '../lib/planVideos'

const tam = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

// Ventana pequeña con el video del reel (con pantalla completa). En el editor también sube, cambia y quita el video.
// Solo se reproduce un video a la vez: al dar play a uno, se pausan todos los demás de la página
function soloUno(e) {
  document.querySelectorAll('video').forEach((v) => { if (v !== e.currentTarget && !v.paused) v.pause() })
}

export default function VideoReel({ video, onSubir, onQuitar, subiendo = false, soloLectura = false }) {
  const [url, setUrl] = useState(null)
  const [fallo, setFallo] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [errDesc, setErrDesc] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)
  const path = video?.path

  const [quiere, setQuiere] = useState(false)   // el video SOLO se descarga cuando alguien pulsa ▶ (si no, cada planificación abierta gastaba datos de Supabase)

  useEffect(() => { setUrl(null); setFallo(false); setQuiere(false) }, [path])

  async function cargar() {
    setQuiere(true); setFallo(false)
    const u = await urlVideo(path)
    if (u) setUrl(u); else setFallo(true)
  }

  async function reintentar() {
    const u = await urlVideo(path, true)
    if (u) { setFallo(false); setUrl(u) } else setFallo(true)
  }
  async function descargar() {
    setErrDesc(''); setBajando(true)
    const r = await descargarVideo(path, video.nombre)
    if (r.error) setErrDesc(r.error)
    setTimeout(() => setBajando(false), 1500)
  }
  function pantallaCompleta() {
    const v = ref.current
    if (!v) return
    const f = v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen
    if (f) f.call(v)
  }
  const lbl = { color: 'var(--text-muted)' }
  const elegir = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && onSubir) onSubir(f) }

  if (!video?.path) {
    if (soloLectura) return null
    return (
      <div className="mt-2">
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={elegir} />
        <button type="button" disabled={subiendo} onClick={() => inputRef.current?.click()} className="text-xs px-3 py-1.5 rounded-md"
          style={{ background: 'var(--panel)', border: '1px dashed var(--accent)', color: 'var(--accent)', opacity: subiendo ? 0.6 : 1 }}>
          {subiendo ? 'Subiendo video…' : '🎞 Subir el video de este reel (por si lo tumban)'}
        </button>
        <span className="text-[11px] ml-2" style={lbl}>mp4 / mov / webm · máx. {MAX_MB} MB</span>
      </div>
    )
  }
  return (
    <div className="mt-2 flex gap-3 items-start">
      <div className="rounded-md overflow-hidden shrink-0" style={{ width: 150, background: '#000', border: '1px solid var(--border)' }}>
        {url
          ? <video ref={ref} src={url} controls autoPlay playsInline preload="auto" onError={reintentar} onPlay={soloUno} style={{ width: '100%', maxHeight: 270, display: 'block', background: '#000' }} />
          : fallo
            ? <div className="flex items-center justify-center text-[11px] text-center p-3" style={{ height: 150, ...lbl }}>No se pudo cargar el video</div>
            : quiere
              ? <div className="flex items-center justify-center text-[11px] text-center p-3" style={{ height: 150, ...lbl }}>Cargando video…</div>
              : <button type="button" onClick={cargar} data-ver-video className="w-full flex flex-col items-center justify-center gap-1 text-[11px]" style={{ height: 150, background: '#000', color: '#fff' }} title="Cargar y reproducir el video"><span style={{ fontSize: 30, lineHeight: 1 }}>▶</span>Ver video</button>}
      </div>
      <div className="text-xs space-y-1.5 min-w-0">
        <p className="truncate" style={lbl} title={video.nombre}>🎞 {video.nombre || 'video'}{video.size ? ` · ${tam(video.size)}` : ''}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" onClick={pantallaCompleta} disabled={!url} title={url ? '' : 'Pulsa ▶ primero para cargar el video'} className="underline" style={{ color: 'var(--accent)' }}>⛶ Pantalla completa</button>
          <button type="button" onClick={descargar} disabled={bajando} className="underline" style={{ color: 'var(--accent)' }}>{bajando ? '⬇ Descargando…' : '⬇ Descargar'}</button>
          {errDesc && <span style={{ color: 'var(--danger)' }}>{errDesc}</span>}
          {fallo && <button type="button" onClick={reintentar} className="underline">Reintentar</button>}
          {!soloLectura && (
            <>
              <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={elegir} />
              <button type="button" disabled={subiendo} onClick={() => inputRef.current?.click()} className="underline">{subiendo ? 'Subiendo…' : 'Cambiar video'}</button>
              <button type="button" onClick={onQuitar} className="underline" style={{ color: 'var(--danger)' }}>Quitar video</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
