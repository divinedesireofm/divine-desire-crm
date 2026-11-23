import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input } from './ui'
import { ETIQUETAS_BASE, claveFan, subirArchivoFan, urlArchivoFan, borrarArchivoFan } from '../lib/fanFicha'

const lbl = { color: 'var(--text-muted)' }
const money = (n) => '$' + Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (s) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const fmtTS = (s) => new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const peso = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const VACIA = { nombre: '', etiquetas: [], pais: '', idioma: '', cumple: '', gustos: '', limites: '', notas_fijas: '' }

// Ficha completa de un fan: datos, etiquetas, notas con historial, archivos y sus compras
export default function FichaFan({ fan, compras = [], nombres = {}, onClose, onCambio }) {
  const { profile } = useAuth()
  const key = claveFan(fan.user)
  const [f, setF] = useState({ ...VACIA, nombre: fan.nombre || '' })
  const [cargado, setCargado] = useState(false)
  const [guardado, setGuardado] = useState('')
  const [notas, setNotas] = useState([])
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [nueva, setNueva] = useState('')
  const [err, setErr] = useState('')
  const ref = useRef(null)

  async function cargar() {
    const [a, b, c] = await Promise.all([
      supabase.from('fan_fichas').select('*').eq('fan_key', key).maybeSingle(),
      supabase.from('fan_notas').select('*').eq('fan_key', key).order('created_at', { ascending: false }),
      supabase.from('fan_archivos').select('*').eq('fan_key', key).order('created_at', { ascending: false }),
    ])
    if (a.error || b.error || c.error) setErr('Falta ejecutar la migración 150 en Supabase (' + (a.error || b.error || c.error).message + ').')
    if (a.data) setF({ ...VACIA, ...a.data, nombre: a.data.nombre || fan.nombre || '' })
    setNotas(b.data || []); setArchivos(c.data || []); setCargado(true)
  }
  useEffect(() => { cargar() }, [key]) // eslint-disable-line

  async function guardarFicha(cambios = {}) {
    const nuevo = { ...f, ...cambios }
    setF(nuevo); setErr('')
    const { error } = await supabase.from('fan_fichas').upsert({ fan_key: key, usuario: fan.user, nombre: nuevo.nombre, etiquetas: nuevo.etiquetas, pais: nuevo.pais, idioma: nuevo.idioma, cumple: nuevo.cumple, gustos: nuevo.gustos, limites: nuevo.limites, notas_fijas: nuevo.notas_fijas, actualizado_por: profile?.id, updated_at: new Date().toISOString() }, { onConflict: 'fan_key' })
    if (error) { setErr(error.message); return }
    setGuardado(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    onCambio?.(key, nuevo)
  }
  const alternarEtiqueta = (t) => guardarFicha({ etiquetas: f.etiquetas.includes(t) ? f.etiquetas.filter((x) => x !== t) : [...f.etiquetas, t] })
  const anadirEtiqueta = () => { const t = nueva.trim(); if (!t) return; setNueva(''); if (!f.etiquetas.includes(t)) guardarFicha({ etiquetas: [...f.etiquetas, t] }) }

  async function anadirNota() {
    const t = texto.trim(); if (!t) return
    const { data, error } = await supabase.from('fan_notas').insert({ fan_key: key, autor_id: profile?.id, texto: t }).select().single()
    if (error) { setErr(error.message); return }
    setTexto(''); setNotas((l) => [data, ...l])
  }
  async function borrarNota(n) {
    if (!confirm('¿Borrar esta nota?')) return
    const { error } = await supabase.from('fan_notas').delete().eq('id', n.id)
    if (error) setErr(error.message); else setNotas((l) => l.filter((x) => x.id !== n.id))
  }
  async function elegirArchivos(e) {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    setErr(''); setSubiendo(true)
    for (const file of files) {
      try { const a = await subirArchivoFan({ fanKey: key, file, userId: profile?.id }); setArchivos((l) => [a, ...l]) } catch (ex) { setErr(ex.message) }
    }
    setSubiendo(false)
  }
  async function abrir(a) { const u = await urlArchivoFan(a.path); if (u) window.open(u, '_blank', 'noopener') }
  async function quitar(a) {
    if (!confirm(`¿Borrar «${a.nombre}»?`)) return
    const { error } = await borrarArchivoFan(a)
    if (error) setErr(error.message); else setArchivos((l) => l.filter((x) => x.id !== a.id))
  }

  const todas = Array.from(new Set([...ETIQUETAS_BASE, ...f.etiquetas]))
  const campo = (t, k, ph, area) => (
    <div>
      <label className="text-xs mb-1 block" style={lbl}>{t}</label>
      {area
        ? <textarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => guardarFicha()} placeholder={ph} rows={3} className="w-full rounded-lg p-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        : <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => guardarFicha()} placeholder={ph} />}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} data-ficha-fan>
      <div className="h-full overflow-y-auto w-full max-w-2xl p-5" style={{ background: 'var(--bg)', borderLeft: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">{fan.user}{f.nombre ? <span style={lbl}> · {f.nombre}</span> : null}</p>
            <p className="text-sm tabular-nums" style={lbl}>Ha gastado <strong style={{ color: 'var(--success)' }}>{money(fan.total)}</strong> · {fan.n} compras · última {fmtF(fan.ultima)}</p>
          </div>
          <Button variant="ghost" onClick={onClose} data-cerrar-ficha>Cerrar ✕</Button>
        </div>
        {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

        <Panel className="p-4 mb-4">
          <p className="text-sm font-medium mb-2">Etiquetas</p>
          <div className="flex flex-wrap gap-2 mb-2" data-etiquetas>
            {todas.map((t) => {
              const on = f.etiquetas.includes(t)
              return <button key={t} type="button" onClick={() => alternarEtiqueta(t)} data-etiqueta={t} className="px-3 py-1 rounded-full text-xs" style={{ border: '1px solid var(--border)', background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--text)' }}>{t}</button>
            })}
          </div>
          <div className="flex gap-2"><Input value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') anadirEtiqueta() }} placeholder="Nueva etiqueta…" /><Button variant="ghost" onClick={anadirEtiqueta}>Añadir</Button></div>
        </Panel>

        <Panel className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">Datos del fan</p>{guardado && <span className="text-xs" style={{ color: 'var(--success)' }} data-ficha-guardada>💾 Guardado a las {guardado}</span>}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campo('Nombre', 'nombre', 'Cómo se llama')}
            {campo('País / zona horaria', 'pais', 'p. ej. EE. UU. (costa este)')}
            {campo('Idioma', 'idioma', 'Español, inglés…')}
            {campo('Cumpleaños / fechas', 'cumple', 'p. ej. 14 de marzo')}
          </div>
          <div className="grid grid-cols-1 gap-3 mt-3">
            {campo('Gustos y qué le gusta comprar', 'gustos', 'Fetiches, tipo de contenido, qué le funciona…', true)}
            {campo('Límites: qué NO hay que hacer ni decir', 'limites', 'Temas a evitar, cómo reacciona mal…', true)}
            {campo('Notas fijas', 'notas_fijas', 'Lo más importante que todo chatter debe saber', true)}
          </div>
        </Panel>

        <Panel className="p-4 mb-4">
          <p className="text-sm font-medium mb-2">Historial de notas</p>
          <div className="flex gap-2 mb-3">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe una nota (qué pasó, qué prometió, qué pidió…)" rows={2} className="flex-1 rounded-lg p-2 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} data-nota-texto />
            <Button onClick={anadirNota} data-nota-anadir>Añadir</Button>
          </div>
          {notas.length === 0 ? <p className="text-sm" style={lbl}>Aún no hay notas.</p> : notas.map((n) => (
            <div key={n.id} className="py-2 text-sm" style={{ borderTop: '1px solid var(--border)' }} data-nota>
              <div className="flex items-center justify-between text-xs mb-0.5" style={lbl}><span>{nombres[n.autor_id] || 'Alguien del equipo'} · {fmtTS(n.created_at)}</span><button type="button" onClick={() => borrarNota(n)} className="hover:underline">borrar</button></div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</p>
            </div>
          ))}
        </Panel>

        <Panel className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Archivos adjuntos</p>
            <input ref={ref} type="file" multiple className="hidden" onChange={elegirArchivos} data-archivo-input />
            <Button variant="ghost" onClick={() => ref.current?.click()} disabled={subiendo}>{subiendo ? 'Subiendo…' : '📎 Adjuntar archivos'}</Button>
          </div>
          <p className="text-xs mb-2" style={lbl}>Capturas, audios, PDF, vídeos… hasta 25 MB cada uno. Solo los ven admin y managers.</p>
          {archivos.length === 0 ? <p className="text-sm" style={lbl}>Sin archivos.</p> : archivos.map((a) => (
            <div key={a.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderTop: '1px solid var(--border)' }} data-archivo>
              <button type="button" onClick={() => abrir(a)} className="min-w-0 flex-1 text-left truncate hover:underline" style={{ color: 'var(--accent)' }}>{a.mime.startsWith('image/') ? '🖼️' : a.mime.startsWith('audio/') ? '🎧' : a.mime.startsWith('video/') ? '🎬' : '📄'} {a.nombre}</button>
              <span className="text-xs tabular-nums" style={lbl}>{peso(a.bytes)} · {fmtF(a.created_at)}</span>
              <button type="button" onClick={() => quitar(a)} className="text-xs hover:underline" style={lbl}>borrar</button>
            </div>
          ))}
        </Panel>

        <Panel className="p-4 mb-8">
          <p className="text-sm font-medium mb-2">Sus compras ({compras.length})</p>
          {compras.length === 0 ? <p className="text-sm" style={lbl}>Sin compras anotadas.</p> : (
            <div className="overflow-x-auto" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="w-full text-sm"><thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Fecha', 'Importe', 'Tipo', 'Turno', 'Chatter', 'Modelo'].map((c) => <th key={c} className="text-left px-2 py-1 font-medium" style={lbl}>{c}</th>)}</tr></thead>
                <tbody>{compras.map((c, i) => <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}><td className="px-2 py-1 whitespace-nowrap">{fmtF(c.fecha)}</td><td className="px-2 py-1 tabular-nums" style={{ color: 'var(--success)' }}>{money(c.monto)}</td><td className="px-2 py-1">{c.tipo === 'tip' ? 'Tip' : 'PPV'}</td><td className="px-2 py-1">{c.turno}</td><td className="px-2 py-1">{c.chatter}</td><td className="px-2 py-1">{c.modelo}</td></tr>)}</tbody></table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
