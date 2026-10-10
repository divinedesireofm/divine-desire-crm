import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'
import { ModelAvatar } from '../components/ModelAvatar'

const TIPO_META = {
  personalizado: { n: 'Personalizado', cat: 'custom' },
  videollamada: { n: 'Videollamada', cat: 'custom' },
  video: { n: 'Video', cat: 'interno' },
  foto: { n: 'Foto', cat: 'interno' },
  audio: { n: 'Audio', cat: 'interno' },
  otro: { n: 'Otro', cat: 'interno' },
}
const QUEES = { personalizado: 'vídeo personalizado', videollamada: 'videollamada', video: 'vídeo', foto: 'foto', audio: 'audio', otro: 'contenido' }
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
    <div className="grid grid-cols-2 gap-2">
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
  const [fEstado, setFEstado] = useState('pendiente')
  const [rev, setRev] = useState(null)
  const [openModel, setOpenModel] = useState({})
  const [openReq, setOpenReq] = useState({})
  const [editId, setEditId] = useState(null)

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelarEdicion() {
    setEditId(null)
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
    return okEstado && okCat
  }), [rows, fEstado, fCat])

  const grupos = useMemo(() => {
    const g = {}
    rows.forEach((r) => { const k = r.modelo || '(sin modelo)'; (g[k] = g[k] || []).push(r) })
    return Object.keys(g).sort((a, b) => g[b].length - g[a].length || a.localeCompare(b)).map((k) => ({ modelo: k, items: g[k] }))
  }, [rows])

  return (
    <div>
      <PageHeader
        title="Solicitudes"
        subtitle="Customs de fans y contenido pedido por el equipo. Al revisar, genera el texto listo para WhatsApp."
      />

      <Panel className="p-5 mb-6">
        <p className="text-sm font-medium mb-4">{editId ? 'Editando solicitud' : 'Nueva solicitud'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tipo</label>
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <optgroup label="Customs de fans">
                <option value="personalizado">Personalizado</option>
                <option value="videollamada">Videollamada</option>
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

      <Panel className="p-5 mb-6">
        <p className="font-medium mb-3">📒 Registro por modelo <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {rows.length} solicitudes en total</span></p>
        {grupos.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay solicitudes registradas.</p>
        ) : grupos.map((g) => (
          <div key={g.modelo} className="mb-2">
            <button
              onClick={() => setOpenModel((o) => ({ ...o, [g.modelo]: !o[g.modelo] }))}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm"
              style={{ background: 'var(--panel-alt)' }}
            >
              <strong>{g.modelo}</strong>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{g.items.length}</span>
              <span className="ml-auto">{openModel[g.modelo] ? '▾' : '▸'}</span>
            </button>
            {openModel[g.modelo] && (
              <div className="pl-3 mt-1 space-y-1">
                {g.items.map((r) => {
                  const tm = T_OBJ(r.tipo)
                  const interno = tm.cat === 'interno'
                  const uo = U_OBJ(r.uso)
                  const eo = E_OBJ(r.estado)
                  const abierto = !!openReq[r.id]
                  const imgs = Array.isArray(r.imagenes) ? r.imagenes : []
                  const vencida = r.estado === 'pendiente' && r.fecha_entrega && String(r.fecha_entrega).slice(0, 10) < hoyISO()
                  const campo = (label, val) => val ? (
                    <div><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span><div>{val}</div></div>
                  ) : null
                  return (
                    <div key={r.id} className="rounded-md" style={{ border: abierto ? '1px solid var(--border)' : '1px solid transparent' }}>
                      <div onClick={() => setOpenReq((o) => ({ ...o, [r.id]: !o[r.id] }))} className="flex items-center gap-3 text-sm px-3 py-1.5 cursor-pointer hover:opacity-80">
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{tm.n}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${eo.color}22`, color: eo.color }}>{eo.n}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{interno ? (uo?.n || '—') : (r.fan || '—')}</span>
                        <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{r.descripcion}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</span>
                        <span className="text-xs">{abierto ? '▾' : '▸'}</span>
                      </div>
                      {abierto && (
                        <div className="px-3 pb-3 pt-1">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
                            {campo('Tipo', tm.n)}
                            {campo('Estado', <span style={{ color: eo.color }}>{eo.n}</span>)}
                            {campo('Modelo', r.modelo)}
                            {interno ? campo('Uso', uo?.n) : (<>
                              {campo('Fan', r.fan)}
                              {campo('Usuario', r.user_of && r.user_of.length > 1 ? r.user_of : '')}
                              {campo('Precio', r.precio)}
                              {campo('Idioma', r.idioma)}
                            </>)}
                            {campo('Duración', r.duracion)}
                            {campo('Entrega estimada', r.fecha_entrega ? <span style={{ color: vencida ? 'var(--danger)' : undefined }}>{fmtFechaISO(r.fecha_entrega)}{vencida ? ' · vencida' : ''}</span> : '')}
                            {campo('Pedida por', r.profiles?.full_name)}
                            {campo('Creada', fmtTS(r.created_at))}
                            {r.updated_at && r.updated_at !== r.created_at ? campo('Última modificación', fmtTS(r.updated_at)) : null}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Descripción</div>
                          <p className="text-sm whitespace-pre-wrap mb-3">{r.descripcion}</p>
                          {imgs.length > 0 && (
                            <div className="mb-3">
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Referencias</div>
                              {imgs.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="block text-xs truncate hover:underline" style={{ color: 'var(--accent)' }}>{u}</a>)}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              value={eo.id}
                              onChange={(e) => cambiarEstado(r, e.target.value)}
                              className="text-xs px-2 py-1 rounded-md"
                              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: eo.color }}
                            >
                              {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.n}</option>)}
                            </select>
                            <button onClick={() => editar(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
                            <button onClick={() => setRev(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Texto WhatsApp</button>
                            {esAdmin && <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </Panel>

      <Panel>
        <div className="p-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-medium">Listado</p>
          <div className="flex gap-2">
            <Select value={fCat} onChange={(e) => setFCat(e.target.value)} className="max-w-[180px]">
              <option value="todas">Todas las categorías</option>
              <option value="custom">Customs de fans</option>
              <option value="interno">Contenido del equipo</option>
            </Select>
            <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="max-w-[160px]">
              <option value="todas">Todos los estados</option>
              {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.n}</option>)}
            </Select>
          </div>
        </div>
        {vis.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>No hay solicitudes en este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Tipo', 'Modelo', 'Fan / Uso', 'Precio', 'Duración', 'Entrega', 'Descripción', 'Pedida por', 'Estado', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vis.map((r) => {
                  const tm = T_OBJ(r.tipo)
                  const interno = tm.cat === 'interno'
                  const uo = U_OBJ(r.uso)
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{tm.n}</span></td>
                      <td className="px-3 py-2"><strong>{r.modelo}</strong></td>
                      <td className="px-3 py-2">{interno ? (uo?.n || '—') : (r.fan || '—')}</td>
                      <td className="px-3 py-2">{interno ? '—' : (r.precio || '—')}</td>
                      <td className="px-3 py-2">{r.duracion || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: r.estado === 'pendiente' && r.fecha_entrega && String(r.fecha_entrega).slice(0, 10) < hoyISO() ? 'var(--danger)' : undefined }}>{r.fecha_entrega ? fmtFechaISO(r.fecha_entrega) : '—'}</td>
                      <td className="px-3 py-2" style={{ maxWidth: 260, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{r.descripcion}</td>
                      <td className="px-3 py-2">
                        {r.profiles?.full_name}
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={E_OBJ(r.estado).id}
                          onChange={(e) => cambiarEstado(r, e.target.value)}
                          className="text-xs px-2 py-1 rounded-md"
                          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: E_OBJ(r.estado).color }}
                        >
                          {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.n}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3 whitespace-nowrap">
                          <button onClick={() => setRev(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Revisar</button>
                          <button onClick={() => editar(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
                          {esAdmin && <button onClick={() => borrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {rev && <RevisarModal key={rev.id} r={rev} onClose={() => setRev(null)} />}
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
