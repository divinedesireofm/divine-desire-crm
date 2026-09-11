import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

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
  { id: 'en_proceso', n: 'En proceso', color: 'var(--accent)' },
  { id: 'entregada', n: 'Entregada', color: 'var(--success)' },
  { id: 'cancelada', n: 'Cancelada', color: 'var(--danger)' },
]
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
    if (r.user_of) L.push('🙋‍♂️ User: ' + r.user_of)
    if (r.precio) L.push('💸 Precio: ' + r.precio)
  }
  if (r.duracion) L.push('⏱️ Duración: ' + r.duracion)
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

const EMPTY_FORM = { tipo: 'personalizado', modelo: '', fan: '', user_of: '', precio: '', duracion: '', idioma: 'español', uso: 'masivo', descripcion: '', imagenesTxt: '' }

export default function Requests() {
  const { profile, role } = useAuth()
  const esMgr = role === 'admin' || role === 'manager'
  const [rows, setRows] = useState([])
  const [modelos, setModelos] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fCat, setFCat] = useState('todas')
  const [fEstado, setFEstado] = useState('activas')
  const [rev, setRev] = useState(null)
  const [openModel, setOpenModel] = useState({})

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
    const payload = esInterno
      ? { tipo: form.tipo, modelo: form.modelo, uso: form.uso, duracion: form.duracion.trim(), descripcion: form.descripcion.trim(), imagenes, solicitado_por: profile.id }
      : { tipo: form.tipo, modelo: form.modelo, fan: form.fan.trim(), user_of: form.user_of.trim(), precio: form.precio.trim(), duracion: form.duracion.trim(), idioma: form.idioma, descripcion: form.descripcion.trim(), imagenes, solicitado_por: profile.id }
    const { error } = await supabase.from('requests').insert([payload])
    setBusy(false)
    if (error) { setError('No se pudo crear la solicitud.'); return }
    setForm((f) => ({ ...f, fan: '', user_of: '', precio: '', duracion: '', descripcion: '', imagenesTxt: '' }))
    load()
  }

  async function cambiarEstado(r, estado) {
    await supabase.from('requests').update({ estado, updated_at: new Date().toISOString() }).eq('id', r.id)
    setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, estado } : x))
  }

  const vis = useMemo(() => rows.filter((r) => {
    const okEstado = fEstado === 'todas' ? true : fEstado === 'activas' ? (r.estado === 'pendiente' || r.estado === 'en_proceso') : r.estado === fEstado
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
        <p className="text-sm font-medium mb-4">Nueva solicitud</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
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
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Modelo</label>
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
              <Input placeholder="Fan (nombre)" value={form.fan} onChange={(e) => setForm({ ...form, fan: e.target.value })} />
              <Input placeholder="Usuario OF (@usuario)" value={form.user_of} onChange={(e) => setForm({ ...form, user_of: e.target.value })} />
              <Input placeholder="Precio acordado ($200)" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </>
          )}
          <Input placeholder={esInterno ? 'Duración (opcional, ej: 1 min)' : 'Duración (ej: 5 min)'} value={form.duracion} onChange={(e) => setForm({ ...form, duracion: e.target.value })} />
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
        <Button onClick={crear} disabled={busy}>{busy ? 'Creando…' : 'Crear solicitud'}</Button>
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
                {g.items.map((r) => (
                  <div key={r.id} onClick={() => setRev(r)} className="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md cursor-pointer hover:opacity-80">
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{T_OBJ(r.tipo).n}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{r.fan || '—'}</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{r.descripcion}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</span>
                  </div>
                ))}
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
              <option value="activas">Activas</option>
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
                  {['Tipo', 'Modelo', 'Fan / Uso', 'Precio', 'Duración', 'Descripción', 'Pedida por', 'Estado', ''].map((c) => (
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
                      <td className="px-3 py-2" style={{ maxWidth: 260, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{r.descripcion}</td>
                      <td className="px-3 py-2">
                        {r.profiles?.full_name}
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.estado}
                          onChange={(e) => cambiarEstado(r, e.target.value)}
                          className="text-xs px-2 py-1 rounded-md"
                          style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: E_OBJ(r.estado).color }}
                        >
                          {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.n}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => setRev(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Revisar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {rev && <RevisarModal r={rev} onClose={() => setRev(null)} />}
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
