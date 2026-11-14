import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { ModelAvatar } from '../components/ModelAvatar'

const TIPO_META = {
  personalizado: { n: 'Personalizado', cat: 'custom' },
  videollamada: { n: 'Videollamada', cat: 'custom' },
  sala_vip: { n: 'Sala Vip', cat: 'custom' },
  close_friends: { n: 'Close Friends Instagram', cat: 'custom' },
  video: { n: 'Video', cat: 'interno' },
  foto: { n: 'Foto', cat: 'interno' },
  audio: { n: 'Audio', cat: 'interno' },
  otro: { n: 'Otro', cat: 'interno' },
}
const QUEES = { personalizado: 'vídeo personalizado', videollamada: 'videollamada', sala_vip: 'acceso a Sala Vip', close_friends: 'acceso a Close Friends de Instagram', video: 'vídeo', foto: 'foto', audio: 'audio', otro: 'contenido' }
const USOS = [
  { id: 'masivo', n: 'Masivo' },
  { id: 'activacion', n: 'Activación' },
  { id: 'recaptacion', n: 'Recaptación de fans' },
  { id: 'otros', n: 'Otros' },
]
const ESTADOS = [
  { id: 'pendiente', n: 'Pendiente', color: 'var(--gold)' },
  { id: 'entregada', n: 'Entregado', color: 'var(--success)' },
  { id: 'cancelada', n: 'Cancelado', color: 'var(--danger)' },
]
const normUser = (v) => '@' + String(v || '').replace(/[@\s]/g, '')
function fmtFechaISO(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function hoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const T_OBJ = (id) => TIPO_META[id] || { n: id, cat: 'interno' }
const E_OBJ = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0]
const U_OBJ = (id) => USOS.find((u) => u.id === id)

function fmtTS(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function genTexto(r) {
  const tm = T_OBJ(r.tipo)
  const L = []
  L.push('📸 QUÉ ES: ' + (QUEES[r.tipo] || tm.n))
  L.push('🚺 Modelo: ' + (r.modelo || ''))
  if (tm.cat === 'interno') {
    const uo = U_OBJ(r.uso)
    if (uo) L.push('🎯 Uso: ' + uo.n)
  } else {
    if (r.fan) L.push('⚡️ Fan: ' + r.fan)
    if (r.user_of && r.user_of.length > 1) L.push('🙋‍♂️ User: ' + r.user_of)
    if (r.precio) L.push('💸 Precio: ' + r.precio)
  }
  if (r.duracion) L.push('⏱️ Duración: ' + r.duracion)
  if (r.fecha_entrega) L.push('📅 Entrega estimada: ' + fmtFechaISO(r.fecha_entrega))
  if (tm.cat !== 'interno' && r.idioma) L.push('🩵 Idioma: ' + r.idioma)
  L.push('✅ Descripción:')
  L.push(r.descripcion || '')
  const imgs = Array.isArray(r.imagenes) ? r.imagenes : []
  if (imgs.length) {
    L.push('')
    L.push('🖼️ Referencias:')
    imgs.forEach((u) => L.push(u))
  }
  return L.join('\n')
}

function parseDur(v) {
  const s = String(v || '')
  const m = s.match(/(\d+)\s*min/i)
  const sg = s.match(/(\d+)\s*s(?:eg)?\b/i)
  return { m: m ? m[1] : '', s: sg ? sg[1] : '' }
}
function DuracionSelect({ value, onChange }) {
  const { m, s } = parseDur(value)
  function cambiar(nm, ns) {
    if (nm === '' && ns === '') { onChange(''); return }
    onChange([nm !== '' ? nm + ' min' : '0 min', ns !== '' && ns !== '0' ? ns + ' s' : ''].filter(Boolean).join(' '))
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Select value={m} onChange={(e) => cambiar(e.target.value, s)}>
        <option value="">Min</option>
        {Array.from({ length: 121 }, (_, i) => <option key={i} value={i}>{i} min</option>)}
      </Select>
      <Select value={s} onChange={(e) => cambiar(m, e.target.value)}>
        <option value="">Seg</option>
        {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{i} s</option>)}
      </Select>
    </div>
  )
}

const EMPTY_FORM = { tipo: 'personalizado', modelo: '', fan: '', user_of: '@', precio: '', duracion: '', fecha_entrega: '', idioma: 'español', uso: 'masivo', descripcion: '', imagenesTxt: '' }

export default function Requests() {
  const { profile, hasAnyRole, hasRole } = useAuth()
  const esAdmin = hasRole('admin')
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [modelos, setModelos] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fCat, setFCat] = useState('todas')
  const [fEstado, setFEstado] = useState('todas')
  const [rev, setRev] = useState(null)
  const [openReq, setOpenReq] = useState({})
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [fModelo, setFModelo] = useState('todas')
  const [q, setQ] = useState('')
  const [vista, setVista] = useState('tarjetas')

  const esInterno = T_OBJ(form.tipo).cat === 'interno'

  async function load() {
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase.from('requests').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(400),
      supabase.from('models').select('id, stage_name').eq('status', 'activa').order('stage_name'),
    ])
    setRows(r || [])
    setModelos(m || [])
    setForm((f) => f.modelo || !m?.length ? f : { ...f, modelo: m[0].stage_name })
  }
  useEffect(() => { load() }, [])

  async function crear() {
    setError('')
    if (!form.modelo) { setError('Selecciona una modelo.'); return }
    if (!form.descripcion.trim()) { setError('Añade una descripción.'); return }
    if (!esInterno && !form.fan.trim()) { setError('En customs de fan, indica el nombre del fan.'); return }
    setBusy(true)
    const imagenes = form.imagenesTxt.split('\n').map((s) => s.trim()).filter(Boolean)
    const entrega = form.fecha_entrega || null
    const user_of = form.user_of.length > 1 ? form.user_of : ''
    const payload = esInterno
      ? { tipo: form.tipo, modelo: form.modelo, uso: form.uso, duracion: form.duracion.trim(), fecha_entrega: entrega, descripcion: form.descripcion.trim(), imagenes }
      : { tipo: form.tipo, modelo: form.modelo, fan: form.fan.trim(), user_of, precio: form.precio.trim() ? '$' + form.precio.trim().replace(/^\$/, '') : '', duracion: form.duracion.trim(), fecha_entrega: entrega, idioma: form.idioma, descripcion: form.descripcion.trim(), imagenes }
    let err
    if (editId) {
      // al cambiar de tipo, limpia los campos que ya no aplican
      const extra = esInterno ? { fan: null, user_of: null, precio: null, idioma: null } : { uso: null }
      ;({ error: err } = await supabase.from('requests').update({ ...payload, ...extra, updated_at: new Date().toISOString() }).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('requests').insert([{ ...payload, solicitado_por: profile.id }]))
    }
    setBusy(false)
    if (err) { setError(editId ? 'No se pudieron guardar los cambios.' : 'No se pudo crear la solicitud.'); return }
    setEditId(null)
    setShowForm(false)
    setForm((f) => ({ ...EMPTY_FORM, tipo: f.tipo, modelo: f.modelo, idioma: f.idioma, uso: f.uso }))
    load()
  }

  function editar(r) {
    setError('')
    setEditId(r.id)
    setForm({
      tipo: r.tipo, modelo: r.modelo || '', fan: r.fan || '', user_of: normUser(r.user_of), precio: String(r.precio || '').replace(/^\$/, ''),
      duracion: r.duracion || '', fecha_entrega: r.fecha_entrega ? String(r.fecha_entrega).slice(0, 10) : '',
      idioma: r.idioma || 'español', uso: r.uso || 'masivo', descripcion: r.descripcion || '',
      imagenesTxt: (Array.isArray(r.imagenes) ? r.imagenes : []).join('\n'),
    })
    setRev(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelarEdicion() {
    setEditId(null)
    setShowForm(false)
    setError('')
    setForm((f) => ({ ...EMPTY_FORM, modelo: f.modelo }))
  }
  async function borrar(r) {
    if (!confirm(`¿Eliminar esta solicitud${r.fan ? ` de ${r.fan}` : ''}? No se puede deshacer.`)) return
    const { error: e } = await supabase.from('requests').delete().eq('id', r.id)
    if (e) { alert('No se pudo eliminar. Solo el admin puede borrar solicitudes.'); return }
    if (editId === r.id) cancelarEdicion()
    setRows((rs) => rs.filter((x) => x.id !== r.id))
  }

  async function cambiarEstado(r, estado) {
    await supabase.from('requests').update({ estado, updated_at: new Date().toISOString() }).eq('id', r.id)
    setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, estado } : x))
  }

  const vis = useMemo(() => rows.filter((r) => {
    const est = E_OBJ(r.estado).id
    const okEstado = fEstado === 'todas' ? true : est === fEstado
    const okCat = fCat === 'todas' ? true : T_OBJ(r.tipo).cat === fCat
    const okModelo = fModelo === 'todas' ? true : r.modelo === fModelo
    const t = q.trim().toLowerCase()
    const okQ = !t || [r.fan, r.user_of, r.descripcion, r.modelo].some((x) => String(x || '').toLowerCase().includes(t))
    return okEstado && okCat && okModelo && okQ
  }), [rows, fEstado, fCat, fModelo, q])

  const conteo = useMemo(() => {
    const c = { pendiente: 0, entregada: 0, cancelada: 0, vencidas: 0 }
    rows.forEach((r) => {
      const e = E_OBJ(r.estado).id
      c[e] = (c[e] || 0) + 1
      if (e === 'pendiente' && r.fecha_entrega && String(r.fecha_entrega).slice(0, 10) < hoyISO()) c.vencidas++
    })
    return c
  }, [rows])

  const grupos = useMemo(() => {
    const g = {}
    vis.forEach((r) => { const k = r.modelo || '(sin modelo)'; (g[k] = g[k] || []).push(r) })
    return Object.keys(g).sort((a, b) => g[b].length - g[a].length || a.localeCompare(b)).map((k) => ({ modelo: k, items: g[k] }))
  }, [vis])

  const tarjeta = (r) => {
    const tm = T_OBJ(r.tipo)
    const interno = tm.cat === 'interno'
    const uo = U_OBJ(r.uso)
    const eo = E_OBJ(r.estado)
    const abierto = !!openReq[r.id]
    const imgs = Array.isArray(r.imagenes) ? r.imagenes : []
    const vencida = r.estado === 'pendiente' && r.fecha_entrega && String(r.fecha_entrega).slice(0, 10) < hoyISO()
    return (
      <div key={r.id} className="rounded-lg p-4 flex flex-col" style={{ background: 'var(--panel)', border: `1px solid ${vencida ? 'var(--danger)' : 'var(--border)'}`, borderLeft: `4px solid ${eo.color}` }}>
        <div className="flex items-center gap-2 mb-3">
          <ModelAvatar name={r.modelo || '?'} size={28} />
          <strong className="text-sm">{r.modelo || '(sin modelo)'}</strong>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{tm.n}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-medium">{interno ? `Uso: ${uo?.n || '—'}` : (r.fan || 'Fan sin nombre')}{!interno && r.user_of && r.user_of.length > 1 ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> {r.user_of}</span> : null}</p>
          {!interno && r.precio ? <span className="text-base font-semibold" style={{ color: 'var(--success)' }}>{r.precio}</span> : null}
        </div>
        <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: 'var(--text-muted)', display: abierto ? 'block' : '-webkit-box', WebkitLineClamp: abierto ? 'unset' : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.descripcion}</p>
        {abierto && (
          <div className="text-xs space-y-1 mb-3" style={{ color: 'var(--text-muted)' }}>
            {r.duracion && <div>⏱️ Duración: {r.duracion}</div>}
            {!interno && r.idioma && <div>🗣️ Idioma: {r.idioma}</div>}
            {r.updated_at && r.updated_at !== r.created_at && <div>✏️ Modificada: {fmtTS(r.updated_at)}</div>}
            {imgs.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="block truncate hover:underline" style={{ color: 'var(--accent)' }}>🖼️ {u}</a>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: vencida ? 'var(--danger)' : undefined }}>📅 {r.fecha_entrega ? fmtFechaISO(r.fecha_entrega) + (vencida ? ' · vencida' : '') : 'Sin fecha de entrega'}</span>
          <span>👤 {r.profiles?.full_name || '—'} · {fmtTS(r.created_at)}</span>
        </div>
        <div className="mt-auto pt-3 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <select value={eo.id} onChange={(e) => cambiarEstado(r, e.target.value)} className="text-xs px-2 py-1 rounded-md"
            style={{ background: `${eo.color}22`, border: `1px solid ${eo.color}`, color: eo.color }}>
            {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.n}</option>)}
          </select>
          <button onClick={() => setRev(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Texto WhatsApp</button>
          <button onClick={() => editar(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
          <button onClick={() => setOpenReq((o) => ({ ...o, [r.id]: !o[r.id] }))} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>{abierto ? 'Ver menos' : 'Ver más'}</button>
          {esAdmin && <button onClick={() => borrar(r)} className="ml-auto text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
        </div>
      </div>
    )
  }

  const chip = (on, color) => ({ background: on ? `${color}22` : 'var(--panel-alt)', border: `1px solid ${on ? color : 'var(--border)'}`, color: on ? color : 'var(--text)' })

  return (
    <div>
      <PageHeader
        title="Solicitudes personalizadas"
        subtitle="Customs de fans y contenido pedido por el equipo. Al revisar, genera el texto listo para WhatsApp."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { id: 'pendiente', n: 'Pendientes', v: conteo.pendiente, c: 'var(--gold)' },
          { id: 'entregada', n: 'Entregadas', v: conteo.entregada, c: 'var(--success)' },
          { id: 'cancelada', n: 'Canceladas', v: conteo.cancelada, c: 'var(--danger)' },
          { id: 'todas', n: 'Todas', v: rows.length, c: 'var(--accent)' },
        ].map((k) => (
          <button key={k.id} onClick={() => setFEstado(k.id)} className="rounded-lg p-4 text-left" style={{ ...chip(fEstado === k.id, k.c), background: fEstado === k.id ? `${k.c}22` : 'var(--panel)' }}>
            <div className="text-2xl font-semibold" style={{ color: k.c }}>{k.v}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.n}</div>
          </button>
        ))}
      </div>
      {conteo.vencidas > 0 && <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>⚠️ {conteo.vencidas} solicitud{conteo.vencidas === 1 ? '' : 'es'} pendiente{conteo.vencidas === 1 ? '' : 's'} con la fecha de entrega vencida.</p>}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px]"><Input placeholder="Buscar por fan, usuario, modelo o descripción…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="min-w-[160px]">
          <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
            <option value="todas">Todas las modelos</option>
            {[...new Set(rows.map((r) => r.modelo).filter(Boolean))].sort().map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        <div className="min-w-[170px]">
          <Select value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            <option value="custom">Customs de fans</option>
            <option value="interno">Contenido del equipo</option>
          </Select>
        </div>
        <div className="flex gap-1">
          {[['tarjetas', 'Tarjetas'], ['modelo', 'Por modelo']].map(([id, n]) => (
            <button key={id} onClick={() => setVista(id)} className="px-3 py-1.5 rounded-full text-xs" style={chip(vista === id, 'var(--accent)')}>{n}</button>
          ))}
        </div>
        <Button onClick={() => { if (showForm && !editId) { setShowForm(false) } else { setEditId(null); setError(''); setForm((f) => ({ ...EMPTY_FORM, modelo: f.modelo })); setShowForm(true) } }}>{showForm && !editId ? 'Cerrar' : '+ Nueva solicitud'}</Button>
      </div>

      {showForm && (
      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">{editId ? 'Editando solicitud' : 'Nueva solicitud'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tipo</label>
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <optgroup label="Customs de fans">
                <option value="personalizado">Personalizado</option>
                <option value="videollamada">Videollamada</option>
                <option value="sala_vip">Sala Vip</option>
                <option value="close_friends">Close Friends Instagram</option>
              </optgroup>
              <optgroup label="Contenido del equipo">
                <option value="video">Video</option>
                <option value="foto">Foto</option>
                <option value="audio">Audio</option>
                <option value="otro">Otro</option>
              </optgroup>
            </Select>
          </div>
          <div>
            <label className="text-xs mb-1 flex items-center gap-2 overflow-visible" style={{ color: 'var(--text-muted)', height: 16, lineHeight: '16px' }}>
              Modelo
              {form.modelo && <span className="inline-flex items-center gap-1.5"><ModelAvatar name={form.modelo} size={18} /><span style={{ color: 'var(--text)' }}>{form.modelo}</span></span>}
            </label>
            <Select value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })}>
              {modelos.map((m) => <option key={m.id} value={m.stage_name}>{m.stage_name}</option>)}
            </Select>
          </div>
          {esInterno ? (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Uso</label>
              <Select value={form.uso} onChange={(e) => setForm({ ...form, uso: e.target.value })}>
                {USOS.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}
              </Select>
            </div>
          ) : (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Idioma</label>
              <Select value={form.idioma} onChange={(e) => setForm({ ...form, idioma: e.target.value })}>
                <option value="español">Español</option>
                <option value="inglés">Inglés</option>
                <option value="otro">Otro</option>
              </Select>
            </div>
          )}
          {!esInterno && (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Nombre del fan</label>
                <Input placeholder="Fan (nombre)" value={form.fan} onChange={(e) => setForm({ ...form, fan: e.target.value })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Usuario del fan en OnlyFans</label>
                <Input placeholder="@usuario" value={form.user_of} onChange={(e) => setForm({ ...form, user_of: normUser(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Precio acordado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="200"
                    value={form.precio}
                    onChange={(e) => setForm({ ...form, precio: e.target.value.replace(/[^0-9.,]/g, '') })}
                    className="w-full rounded-md py-2 pr-3 text-sm outline-none focus:ring-1"
                    style={{ paddingLeft: 26, background: 'var(--panel-alt)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{esInterno ? 'Duración (opcional)' : 'Duración'}</label>
            <DuracionSelect value={form.duracion} onChange={(v) => setForm({ ...form, duracion: v })} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha de entrega estimada</label>
            <Input type="date" value={form.fecha_entrega} onChange={(e) => setForm({ ...form, fecha_entrega: e.target.value })} />
          </div>
        </div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
          {esInterno ? 'Descripción / qué se necesita' : 'Descripción / requerimientos del fan'}
        </label>
        <textarea
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          rows={3}
          placeholder={esInterno ? 'Qué contenido hace falta, idea, estilo, para qué campaña, fecha límite...' : 'Qué pidió exactamente el fan, detalles acordados, fecha límite...'}
          className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Enlaces de imágenes de referencia (opcional, uno por línea)</label>
        <textarea
          value={form.imagenesTxt}
          onChange={(e) => setForm({ ...form, imagenesTxt: e.target.value })}
          rows={2}
          placeholder="https://..."
          className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2">
          <Button onClick={crear} disabled={busy}>{busy ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear solicitud'}</Button>
          {editId && <Button variant="ghost" onClick={cancelarEdicion}>Cancelar edición</Button>}
        </div>
      </Panel>
      )}

      {rev && <RevisarModal key={rev.id} r={rev} onClose={() => setRev(null)} />}

      {vis.length === 0 ? (
        <Panel className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {rows.length === 0 ? 'Aún no hay solicitudes registradas. Pulsa «+ Nueva solicitud» para crear la primera.' : 'No hay solicitudes con estos filtros.'}
        </Panel>
      ) : vista === 'tarjetas' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">{vis.map(tarjeta)}</div>
      ) : (
        grupos.map((g) => (
          <div key={g.modelo} className="mb-6 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <ModelAvatar name={g.modelo} size={28} />
              <strong>{g.modelo}</strong>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{g.items.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{g.items.map(tarjeta)}</div>
          </div>
        ))
      )}
    </div>
  )
}

function RevisarModal({ r, onClose }) {
  const [texto, setTexto] = useState(() => genTexto(r))
  return (
    <Panel className="p-5 mt-4">
      <p className="text-sm font-medium mb-1">Revisar · {T_OBJ(r.tipo).n}{r.modelo ? ` · ${r.modelo}` : ''}</p>
      <label className="text-xs mb-1 block mt-3" style={{ color: 'var(--text-muted)' }}>Texto para enviar a la modelo (WhatsApp) · editable</label>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={10}
        className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3 font-mono"
        style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        El texto copiado incluye los enlaces a las imágenes. Pégalo en WhatsApp; si quieres la foto incrustada, ábrela desde el enlace y adjúntala.
      </p>
      <div className="flex gap-2">
        <CopyButton text={texto} label="Copiar texto" />
        <Button variant="ghost" onClick={() => setTexto(genTexto(r))}>Regenerar</Button>
        <Button onClick={onClose}>Cerrar</Button>
      </div>
    </Panel>
  )
}
