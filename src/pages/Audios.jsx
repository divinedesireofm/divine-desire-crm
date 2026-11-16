import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { readFunctionError } from '../lib/functions'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import { audioAMp4 } from '../lib/audioMp4'
import { esOgg, oggAWav } from '../lib/audioWav'

const BUCKET = 'audios-chatting'
const MAX_TEXTO = 2000
const TONOS = [
  { id: 'auto', n: 'Automático (según el texto)' },
  { id: 'happy', n: 'Alegre' },
  { id: 'calm', n: 'Tranquila' },
  { id: 'whisper', n: 'Susurro' },
  { id: 'fluent', n: 'Natural / fluido' },
  { id: 'surprised', n: 'Sorprendida' },
  { id: 'sad', n: 'Triste' },
  { id: 'angry', n: 'Enfadada' },
  { id: 'fearful', n: 'Asustada' },
  { id: 'disgusted', n: 'Disgustada' },
]
const TN = Object.fromEntries(TONOS.map((t) => [t.id, t.n]))
const lbl = { color: 'var(--text-muted)' }
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
const fmtDur = (s) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}` }
const slug = (t) => String(t || 'audio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'audio'

// Duración de un archivo de audio antes de subirlo
function duracionDe(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration) }
    a.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer el audio. Usa mp3, m4a o wav.')) }
    a.src = url
  })
}

// Reproductor que pide una URL firmada temporal (el bucket es privado)
function Reproductor({ path }) {
  const [url, setUrl] = useState(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    let vivo = true
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data, error }) => { if (!vivo) return; if (error || !data?.signedUrl) setFallo(true); else setUrl(data.signedUrl) })
    return () => { vivo = false }
  }, [path])
  if (fallo) return <span className="text-xs" style={{ color: 'var(--danger)' }}>No se pudo cargar el audio.</span>
  if (!url) return <span className="text-xs" style={lbl}>Cargando audio…</span>
  return <audio controls preload="none" src={url} className="h-9 w-full max-w-[320px]" />
}

export default function Audios() {
  const { profile, hasAnyRole } = useAuth()
  const gestiona = hasAnyRole(['admin', 'manager'])
  const [modelos, setModelos] = useState([])
  const [voces, setVoces] = useState([])
  const [audios, setAudios] = useState([])
  const [modeloId, setModeloId] = useState('')
  const [todas, setTodas] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [clonando, setClonando] = useState(false)
  const [permiso, setPermiso] = useState(false)
  const [tono, setTono] = useState('auto')
  const [velocidad, setVelocidad] = useState(1)
  const [texto, setTexto] = useState('')
  const [generando, setGenerando] = useState(false)
  const [descargando, setDescargando] = useState('')
  const [conexion, setConexion] = useState(null)
  const [probando, setProbando] = useState(false)
  const [verTexto, setVerTexto] = useState(null)
  const fileRef = useRef(null)

  async function cargar() {
    const [{ data: m }, { data: v, error: e1 }, { data: a, error: e2 }] = await Promise.all([
      supabase.from('models').select('id, stage_name, status').order('stage_name'),
      supabase.from('model_voices').select('*'),
      supabase.from('audio_generations').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    const lista = (m || []).filter((x) => x.status !== 'baja')
    setModelos(lista); setVoces(v || []); setAudios(a || [])
    setModeloId((id) => id || lista[0]?.id || '')
    if (e1 || e2) setErr(/model_voices|audio_generations/.test((e1 || e2).message) ? 'Falta ejecutar la migración 140 en Supabase.' : (e1 || e2).message)
  }
  useEffect(() => { cargar() }, [])

  const modelo = modelos.find((m) => m.id === modeloId)
  const voz = voces.find((v) => v.model_id === modeloId)
  const muestras = voz?.muestras || []
  const nombreModelo = (id) => modelos.find((m) => m.id === id)?.stage_name || '—'
  const registro = useMemo(() => (todas ? audios : audios.filter((a) => a.model_id === modeloId)), [audios, todas, modeloId])
  const listoParaGenerar = muestras.length > 0

  // ---------- muestras de voz ----------
  async function guardarVoz(cambios) {
    const fila = { model_id: modeloId, ...cambios, updated_at: new Date().toISOString() }
    if (!voz) fila.created_by = profile?.id
    const { error } = await supabase.from('model_voices').upsert(fila, { onConflict: 'model_id' })
    if (error) throw error
  }
  async function subirMuestras(files) {
    setErr(''); setMsg('')
    if (!modeloId) { setErr('Elige primero una modelo.'); return }
    setSubiendo(true)
    try {
      let actuales = [...muestras]
      let principal = voz?.muestra_principal || null
      for (const f of Array.from(files)) {
        if (!/\.(mp3|m4a|wav|ogg|oga|opus)$/i.test(f.name)) throw new Error(`«${f.name}»: usa un audio mp3, m4a, wav u ogg.`)
        if (f.size > 20 * 1024 * 1024) throw new Error(`«${f.name}» pesa más de 20 MB.`)
        // MiniMax no acepta ogg: se convierte a WAV en el navegador antes de subirlo
        let subir = f, nombre = f.name, dur
        if (esOgg(f.name)) {
          const c = await oggAWav(f)
          subir = c.blob; dur = c.duracion; nombre = f.name.replace(/\.[^.]+$/, '') + '.wav'
          if (subir.size > 20 * 1024 * 1024) throw new Error(`«${f.name}» convertido pesa más de 20 MB: recórtalo.`)
        } else dur = await duracionDe(f)
        if (dur < 10) throw new Error(`«${f.name}» dura ${Math.round(dur)} s: la muestra debe durar al menos 10 segundos.`)
        if (dur > 300) throw new Error(`«${f.name}» dura más de 5 minutos: recórtala.`)
        const path = `muestras/${modeloId}/${crypto.randomUUID()}-${slug(nombre.replace(/\.[^.]+$/, ''))}.${nombre.split('.').pop().toLowerCase()}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, subir, { contentType: subir.type || f.type || 'audio/mpeg' })
        if (error) throw new Error('No se pudo subir «' + f.name + '»: ' + error.message)
        actuales.push({ path, nombre, duracion_s: Math.round(dur), bytes: subir.size })
        if (!principal) principal = path
      }
      await guardarVoz({ muestras: actuales, muestra_principal: principal })
      setMsg('✓ Muestras subidas. Pulsa «Clonar voz» para que MiniMax aprenda la voz.')
      cargar()
    } catch (e) { setErr(e.message) }
    setSubiendo(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  async function quitarMuestra(m) {
    if (!confirm(`¿Quitar la muestra «${m.nombre}»?`)) return
    await supabase.storage.from(BUCKET).remove([m.path])
    const resto = muestras.filter((x) => x.path !== m.path)
    const eraPrincipal = voz.muestra_principal === m.path
    try {
      await guardarVoz({ muestras: resto, muestra_principal: eraPrincipal ? (resto[0]?.path || null) : voz.muestra_principal, ...(eraPrincipal ? { estado: 'sin_clonar' } : {}) })
      cargar()
    } catch (e) { setErr(e.message) }
  }
  async function hacerPrincipal(m) {
    if (voz.muestra_principal === m.path) return
    try { await guardarVoz({ muestra_principal: m.path, estado: 'sin_clonar' }); setMsg('Muestra principal cambiada: hay que volver a clonar la voz.'); cargar() } catch (e) { setErr(e.message) }
  }
  async function clonar() {
    setErr(''); setMsg('')
    if (!permiso) { setErr('Marca la casilla confirmando que la modelo ha dado permiso para usar su voz.'); return }
    setClonando(true)
    const { data, error } = await supabase.functions.invoke('minimax-audio', { body: { action: 'clonar', model_id: modeloId } })
    setClonando(false)
    if (error) { setErr(await readFunctionError(error)); cargar(); return }
    if (data?.error) { setErr(data.error); cargar(); return }
    setMsg('✓ Voz clonada. Ya puedes crear audios con ella.')
    cargar()
  }

  // ---------- generar ----------
  async function generar() {
    setErr(''); setMsg('')
    if (!modeloId) { setErr('Elige una modelo.'); return }
    if (!texto.trim()) { setErr('Escribe el texto que debe decir el audio.'); return }
    setGenerando(true)
    const { data, error } = await supabase.functions.invoke('minimax-audio', { body: { action: 'generar', model_id: modeloId, texto: texto.trim(), tono, velocidad } })
    setGenerando(false)
    if (error) { setErr(await readFunctionError(error)); cargar(); return }
    if (data?.error) { setErr(data.error); cargar(); return }
    setMsg('✓ Audio generado. Lo tienes arriba del todo en el registro.')
    setTexto('')
    cargar()
  }

  // ---------- registro ----------
  async function descargar(a, formato) {
    setDescargando(a.id + formato); setErr('')
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(a.path)
      if (error || !data) throw new Error(error?.message || 'No se pudo descargar el audio.')
      const blob = formato === 'mp4' ? await audioAMp4(data) : data
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url; el.download = `${slug(nombreModelo(a.model_id))}-${new Date(a.created_at).toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${formato}`
      document.body.appendChild(el); el.click(); el.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { setErr(e.message) }
    setDescargando('')
  }
  async function eliminar(a) {
    if (!confirm('¿Eliminar este audio? No se puede deshacer.')) return
    if (a.path) await supabase.storage.from(BUCKET).remove([a.path])
    const { error } = await supabase.from('audio_generations').delete().eq('id', a.id)
    if (error) { setErr(error.message); return }
    cargar()
  }
  async function probar() {
    setProbando(true); setConexion(null)
    const { data, error } = await supabase.functions.invoke('minimax-audio', { body: { action: 'probar' } })
    setProbando(false)
    if (error) { const m = await readFunctionError(error); setConexion({ ok: false, mensaje: /not found|404|Failed to send/i.test(m) ? 'La función «minimax-audio» todavía no está desplegada en Supabase.' : m }); return }
    setConexion(data)
  }

  const estadoVoz = !voz || !muestras.length ? { t: 'Sin muestras', c: 'var(--text-muted)' } : voz.estado === 'lista' ? { t: 'Voz clonada', c: 'var(--success)' } : voz.estado === 'error' ? { t: 'Error al clonar', c: 'var(--danger)' } : { t: 'Pendiente de clonar', c: 'var(--gold)' }

  return (
    <div>
      <PageHeader title="Audios" subtitle="Crea audios con la voz de cada modelo: elige la modelo, el tono y el texto. La voz se aprende de sus audios de ejemplo (MiniMax)." />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }} data-audios-error>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{msg}</p>}

      {gestiona && (
        <Panel className="p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">Conexión con MiniMax</p>
              <p className="text-xs" style={lbl}>La clave de MiniMax se guarda como secreto en Supabase (nunca en el navegador). Pulsa para comprobar que todo está bien conectado.</p>
              {conexion && <p className="text-xs mt-1" style={{ color: conexion.ok ? 'var(--success)' : 'var(--danger)' }} data-conexion>{conexion.ok ? '✓ ' : '✗ '}{conexion.mensaje}{conexion.modelo ? ` · modelo de voz: ${conexion.modelo}` : ''}</p>}
            </div>
            <Button variant="ghost" onClick={probar} disabled={probando}>{probando ? 'Comprobando…' : 'Comprobar conexión'}</Button>
          </div>
        </Panel>
      )}

      <Panel className="p-4 mb-4">
        <label className="text-xs mb-1 block" style={lbl}>Modelo</label>
        <div className="max-w-sm"><Select value={modeloId} onChange={(e) => { setModeloId(e.target.value); setErr(''); setMsg(''); setPermiso(false) }} data-audios-modelo>
          {modelos.length === 0 && <option value="">No hay modelos</option>}
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select></div>
      </Panel>

      {modeloId && (
        <>
          <Panel className="p-5 mb-4" data-bloque-voz>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <p className="text-sm font-medium">1. Voz de {modelo?.stage_name}</p>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${estadoVoz.c} 16%, transparent)`, color: estadoVoz.c }} data-estado-voz>{estadoVoz.t}</span>
            </div>
            <p className="text-xs mb-3" style={lbl}>Sube audios de ejemplo donde se oiga claramente a la modelo hablando, sin música ni ruido. Cada audio debe durar entre 10 segundos y 5 minutos (mp3, m4a, wav u ogg, máx. 20 MB; los ogg se convierten solos a WAV). Para clonar se usa la muestra marcada como principal.</p>
            {muestras.length > 0 && (
              <div className="mb-3 space-y-2">
                {muestras.map((m) => (
                  <div key={m.path} className="flex items-center gap-3 flex-wrap rounded-md px-3 py-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} data-muestra>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="principal" checked={voz?.muestra_principal === m.path} onChange={() => gestiona && hacerPrincipal(m)} disabled={!gestiona} />
                      <span className="font-medium">{m.nombre}</span>
                    </label>
                    <span className="text-xs" style={lbl}>{fmtDur(m.duracion_s || 0)} · {(m.bytes / 1048576).toFixed(1)} MB{voz?.muestra_principal === m.path ? ' · principal' : ''}</span>
                    <Reproductor path={m.path} />
                    {gestiona && <button className="text-xs underline ml-auto" style={{ color: 'var(--danger)' }} onClick={() => quitarMuestra(m)}>Quitar</button>}
                  </div>
                ))}
              </div>
            )}
            {gestiona ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <input ref={fileRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.oga,.opus,audio/*" multiple className="hidden" onChange={(e) => e.target.files?.length && subirMuestras(e.target.files)} data-input-muestras />
                  <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={subiendo}>{subiendo ? 'Subiendo…' : '+ Subir audios de ejemplo'}</Button>
                  {muestras.length > 0 && (
                    <>
                      <label className="flex items-center gap-2 text-xs cursor-pointer" style={lbl}><input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} data-permiso-voz /> La modelo ha dado su permiso para usar su voz</label>
                      <Button onClick={clonar} disabled={clonando || subiendo}>{clonando ? 'Clonando…' : voz?.estado === 'lista' ? 'Volver a clonar la voz' : 'Clonar voz'}</Button>
                    </>
                  )}
                </div>
                {voz?.estado === 'error' && voz.error && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{voz.error}</p>}
              </>
            ) : <p className="text-xs" style={lbl}>La voz la configuran el administrador y los managers.</p>}
          </Panel>

          <Panel className="p-5 mb-4" data-bloque-crear>
            <p className="text-sm font-medium mb-3">2. Crear audio</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div><label className="text-xs mb-1 block" style={lbl}>Tono</label>
                <Select value={tono} onChange={(e) => setTono(e.target.value)} data-audios-tono>{TONOS.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}</Select></div>
              <div><label className="text-xs mb-1 block" style={lbl}>Velocidad: {velocidad.toFixed(2).replace(/\.?0+$/, '')}×</label>
                <input type="range" min="0.7" max="1.3" step="0.05" value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} className="w-full" /></div>
            </div>
            <label className="text-xs mb-1 block" style={lbl}>Texto que dirá el audio</label>
            <textarea value={texto} maxLength={MAX_TEXTO} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe aquí lo que va a decir el audio…" data-audios-texto
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 110 }} />
            <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
              <span className="text-xs" style={lbl}>{texto.length} / {MAX_TEXTO} caracteres</span>
              <Button onClick={generar} disabled={generando || !listoParaGenerar} data-generar>{generando ? 'Generando audio…' : 'Generar audio'}</Button>
            </div>
            {!listoParaGenerar && <p className="text-xs mt-2" style={lbl}>Primero hace falta subir audios de ejemplo y clonar la voz (paso 1).</p>}
            {listoParaGenerar && voz?.estado !== 'lista' && <p className="text-xs mt-2" style={{ color: 'var(--gold)' }}>La voz aún no está clonada: al generar el primer audio se clonará automáticamente (puede tardar un poco más).</p>}
          </Panel>
        </>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-sm font-medium">3. Registro de audios {registro.length ? `(${registro.length})` : ''}</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={lbl}><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver las de todas las modelos</label>
      </div>
      {registro.length === 0 ? (
        <Panel className="p-6 text-sm text-center" style={lbl}>Todavía no hay audios{todas ? '' : ' de esta modelo'}.</Panel>
      ) : (
        <div className="space-y-2" data-registro>
          {registro.map((a) => (
            <Panel key={a.id} className="p-4" data-audio-item>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><strong>{nombreModelo(a.model_id)}</strong> <span className="text-xs" style={lbl}>· {fmtFecha(a.created_at)} · {TN[a.tono] || a.tono}{a.duracion_ms ? ` · ${fmtDur(a.duracion_ms / 1000)}` : ''}</span></p>
                  <p className="text-sm mt-1 max-w-[640px] truncate" style={lbl} title={a.texto}>{a.texto}</p>
                  {a.texto.length > 70 && <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => setVerTexto(a)}>Ver texto completo</button>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {a.path ? <Reproductor path={a.path} /> : <span className="text-xs" style={{ color: 'var(--danger)' }}>{a.error || 'Sin audio'}</span>}
                </div>
              </div>
              {a.path && (
                <div className="flex gap-2 flex-wrap mt-3">
                  <Button variant="ghost" onClick={() => descargar(a, 'mp3')} disabled={!!descargando} data-descargar-mp3>{descargando === a.id + 'mp3' ? 'Preparando…' : '⬇ MP3'}</Button>
                  <Button variant="ghost" onClick={() => descargar(a, 'mp4')} disabled={!!descargando} data-descargar-mp4>{descargando === a.id + 'mp4' ? 'Convirtiendo…' : '⬇ MP4'}</Button>
                  {gestiona && <Button variant="danger" onClick={() => eliminar(a)} data-eliminar-audio>Eliminar</Button>}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {verTexto && (
        <div onClick={() => setVerTexto(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-2">{nombreModelo(verTexto.model_id)} · {fmtFecha(verTexto.created_at)}</p>
            <p className="text-sm whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{verTexto.texto}</p>
            <div className="mt-4 text-right"><Button variant="ghost" onClick={() => setVerTexto(null)}>Cerrar</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
