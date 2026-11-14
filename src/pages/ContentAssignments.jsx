import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { ModelAvatar } from '../components/ModelAvatar'

const DIAS_ALERTA = 14
export const TIPOS_CONTENIDO = [
  { id: 'video', n: 'Vídeo', e: '🎬' },
  { id: 'foto', n: 'Foto', e: '📷' },
  { id: 'audio', n: 'Audio', e: '🎧' },
  { id: 'sexting', n: 'Sexting', e: '💬' },
  { id: 'pack', n: 'Pack', e: '📦' },
]
const slug = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

function diasDesde(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00')
  return Math.floor((new Date() - d) / (1000 * 60 * 60 * 24))
}
function hoyISO() { return new Date().toISOString().slice(0, 10) }
function fmt(iso) { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}` }

function Tarjeta({ r, alerta, desde, onRecordar, onBorrar, onEditar, tipoObj }) {
  const t = tipoObj(r.tipo)
  const modelo = r.models?.stage_name || '—'
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
      className="p-3 rounded-md cursor-grab active:cursor-grabbing select-none"
      style={{ background: alerta ? 'var(--danger)11' : 'var(--panel-alt)', border: `1px solid ${alerta ? 'var(--danger)' : 'var(--border)'}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ModelAvatar name={modelo} size={22} />
        <span className="text-xs font-medium">{modelo}</span>
        {t && <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{t.e} {t.n}</span>}
      </div>
      <p className="text-sm font-medium mb-1">{r.titulo}</p>
      {r.observaciones && <p className="text-xs mb-2 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{r.observaciones}</p>}
      <p className="text-xs mb-2" style={{ color: r.hecho_en ? 'var(--success)' : 'var(--text-muted)' }}>
        {r.hecho_en ? `Hecho el ${fmt(r.hecho_en)}` : r.enviado_en ? `Enviado el ${fmt(r.enviado_en)}` : 'Sin enviar todavía'}
        {!r.hecho_en && r.recordado_en && <> · recordado {fmt(r.recordado_en)}</>}
      </p>
      {alerta && <p className="text-xs mb-2 font-medium" style={{ color: 'var(--danger)' }}>⚠️ {desde} días sin hacerse</p>}
      <div className="flex gap-3 flex-wrap">
        {alerta && <button onClick={() => onRecordar(r)} className="text-xs hover:underline" style={{ color: 'var(--gold)' }}>Ya se lo he recordado</button>}
        <button onClick={() => onEditar(r)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
        <button onClick={() => onBorrar(r)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Borrar</button>
      </div>
    </div>
  )
}

function Columna({ id, titulo, contador, vacio, children, dragOver, setDragOver, onSoltar, colorBorde }) {
  return (
    <Panel
      className="p-5"
      style={{ outline: dragOver === id ? `2px dashed ${colorBorde}` : 'none', outlineOffset: -2 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(id) }}
      onDragLeave={() => setDragOver((d) => (d === id ? null : d))}
      onDrop={(e) => { e.preventDefault(); setDragOver(null); onSoltar(id, e) }}
    >
      <p className="text-sm font-medium mb-4">{titulo} ({contador})</p>
      {contador === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{vacio}</p> : <div className="space-y-3">{children}</div>}
    </Panel>
  )
}

const FORM0 = { model_id: '', titulo: '', tipo: 'video', observaciones: '' }

export default function ContentAssignments() {
  const { profile } = useAuth()
  const [modelos, setModelos] = useState([])
  const [filtroModelo, setFiltroModelo] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = cerrado
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(null)
  const [tipos, setTipos] = useState(TIPOS_CONTENIDO)
  const [nuevoTipo, setNuevoTipo] = useState(null) // { e, n } mientras se crea
  const [gestionar, setGestionar] = useState(false)
  const tipoObj = (id) => tipos.find((t) => t.id === id) || (id ? { id, n: id, e: '🏷️' } : null)

  async function loadTipos() {
    const { data, error: er } = await supabase.from('content_tipos').select('*').eq('activo', true).order('orden').order('nombre')
    if (!er && data && data.length) setTipos(data.map((t) => ({ id: t.id, n: t.nombre, e: t.emoji || '🏷️' })))
  }
  async function crearTipo() {
    const n = (nuevoTipo?.n || '').trim()
    if (!n) return
    let id = slug(n) || 'tipo'
    if (tipos.some((t) => t.id === id)) id += '_' + Math.random().toString(36).slice(2, 5)
    const { error: er } = await supabase.from('content_tipos').insert([{ id, nombre: n, emoji: (nuevoTipo.e || '').trim() || '🏷️', orden: tipos.length + 1, activo: true }])
    if (er) { alert('No se pudo crear el tipo. ¿Has ejecutado la migración 134 en Supabase?'); return }
    setNuevoTipo(null); await loadTipos(); setForm((f) => (f ? { ...f, tipo: id } : f))
  }
  async function renombrarTipo(t, nombre) {
    const n = nombre.trim()
    if (!n || n === t.n) return
    await supabase.from('content_tipos').update({ nombre: n }).eq('id', t.id); loadTipos()
  }
  async function borrarTipo(t) {
    if (!confirm(`¿Eliminar el tipo «${t.n}»? Los contenidos que ya lo usan se quedan como están.`)) return
    await supabase.from('content_tipos').delete().eq('id', t.id)
    if (filtroTipo === t.id) setFiltroTipo('todos')
    loadTipos()
  }

  async function load() {
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from('models').select('id, stage_name, status').order('stage_name'),
      supabase.from('content_assignments').select('*, models(stage_name)').order('created_at', { ascending: false }),
    ])
    setModelos((m || []).filter((x) => x.status !== 'baja'))
    setRows(r || [])
    setLoading(false)
  }
  useEffect(() => { load(); loadTipos() }, [])

  function abrirNuevo() {
    setError(''); setEditId(null)
    setForm({ ...FORM0, model_id: filtroModelo !== 'todas' ? filtroModelo : '' })
  }
  function editar(r) {
    setError(''); setEditId(r.id)
    setForm({ model_id: r.model_id, titulo: r.titulo || '', tipo: r.tipo || 'video', observaciones: r.observaciones || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cerrar() { setForm(null); setEditId(null); setError('') }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!form.model_id) { setError('Elige la modelo a la que se lo pides.'); return }
    if (!form.titulo.trim()) { setError('Pon el nombre del contenido.'); return }
    const payload = { model_id: form.model_id, titulo: form.titulo.trim(), tipo: form.tipo, observaciones: form.observaciones.trim() || null }
    if (editId) await supabase.from('content_assignments').update(payload).eq('id', editId)
    else await supabase.from('content_assignments').insert([{ ...payload, creado_por: profile.id }])
    cerrar(); load()
  }

  async function recordar(row) {
    await supabase.from('content_assignments').update({ recordado_en: hoyISO() }).eq('id', row.id)
    load()
  }
  async function borrar(row) {
    if (!confirm('¿Eliminar este contenido de la lista? (por ejemplo, si al final se cancela)')) return
    await supabase.from('content_assignments').delete().eq('id', row.id)
    load()
  }
  async function soltarEn(columna, e) {
    const id = e.dataTransfer.getData('text/plain')
    const row = rows.find((r) => r.id === id)
    if (!row) return
    let update = null
    if (columna === 'pendiente') update = { enviado_en: null, hecho_en: null, recordado_en: null }
    if (columna === 'enviado') update = { enviado_en: row.enviado_en || hoyISO(), hecho_en: null }
    if (columna === 'hecho') update = { enviado_en: row.enviado_en || hoyISO(), hecho_en: hoyISO() }
    if (!update) return
    await supabase.from('content_assignments').update(update).eq('id', id)
    load()
  }

  const vis = useMemo(() => rows.filter((r) => (filtroModelo === 'todas' || r.model_id === filtroModelo) && (filtroTipo === 'todos' || r.tipo === filtroTipo)), [rows, filtroModelo, filtroTipo])
  const pendientes = vis.filter((r) => !r.enviado_en && !r.hecho_en)
  const enviados = vis.filter((r) => r.enviado_en && !r.hecho_en)
  const hechos = vis.filter((r) => r.hecho_en)
  const atrasados = enviados.filter((r) => diasDesde(r.recordado_en || r.enviado_en) >= DIAS_ALERTA).length

  return (
    <div>
      <PageHeader
        title="Contenido pedido a las modelos"
        subtitle="Todo el contenido pedido a todas las chicas. Arrastra las tarjetas entre columnas para cambiar su estado."
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-[200px]">
          <Select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)}>
            <option value="todas">Todas las modelos</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: 'todos', n: 'Todos', e: '' }, ...tipos].map((t) => (
            <button key={t.id} onClick={() => setFiltroTipo(t.id)} className="px-3 py-1.5 rounded-full text-xs"
              style={{ background: filtroTipo === t.id ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${filtroTipo === t.id ? 'var(--accent)' : 'var(--border)'}`, color: filtroTipo === t.id ? 'var(--accent)' : 'var(--text)' }}>
              {t.e} {t.n}
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={abrirNuevo}>+ Pedir contenido</Button>
      </div>

      {form && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-4">{editId ? 'Editar contenido pedido' : 'Pedir contenido nuevo'}</p>
          <form onSubmit={guardar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Modelo</label>
                <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
                  <option value="">— elige modelo —</option>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Nombre del contenido</label>
                <Input placeholder="Ej: set lencería roja" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              </div>
            </div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tipo de contenido</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {tipos.map((t) => {
                const on = form.tipo === t.id
                return (
                  <button key={t.id} type="button" onClick={() => setForm({ ...form, tipo: t.id })} className="px-3 py-1.5 rounded-full text-sm"
                    style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}>
                    {t.e} {t.n}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {nuevoTipo ? (
                <>
                  <input value={nuevoTipo.e} onChange={(e) => setNuevoTipo({ ...nuevoTipo, e: e.target.value })} placeholder="🏷️" maxLength={4} className="px-2 py-1.5 rounded-md text-sm outline-none text-center" style={{ width: 52, background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <input autoFocus value={nuevoTipo.n} onChange={(e) => setNuevoTipo({ ...nuevoTipo, n: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearTipo() } }} placeholder="Nombre del nuevo tipo" className="px-3 py-1.5 rounded-md text-sm outline-none" style={{ width: 200, background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <Button type="button" onClick={crearTipo}>Crear tipo</Button>
                  <Button type="button" variant="ghost" onClick={() => setNuevoTipo(null)}>Cancelar</Button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setNuevoTipo({ e: '', n: '' })} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>+ Crear un tipo nuevo</button>
                  <button type="button" onClick={() => setGestionar((g) => !g)} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>{gestionar ? 'Ocultar gestión de tipos' : 'Gestionar tipos'}</button>
                </>
              )}
            </div>
            {gestionar && (
              <div className="mb-4 p-3 rounded-md space-y-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                {tipos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span>{t.e}</span>
                    <input defaultValue={t.n} onBlur={(e) => renombrarTipo(t, e.target.value)} className="px-2 py-1 rounded-md text-sm outline-none flex-1" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <button type="button" onClick={() => borrarTipo(t)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                  </div>
                ))}
              </div>
            )}
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Otras observaciones (opcional)</label>
            <textarea
              value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={3}
              placeholder="Cantidad, estilo, duración, fecha límite, detalles…"
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-2">
              <Button type="submit">{editId ? 'Guardar cambios' : 'Añadir a pendientes'}</Button>
              <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            </div>
          </form>
        </Panel>
      )}

      {atrasados > 0 && (
        <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>⚠️ {atrasados} contenido{atrasados === 1 ? '' : 's'} enviado{atrasados === 1 ? '' : 's'} lleva{atrasados === 1 ? '' : 'n'} más de {DIAS_ALERTA} días sin entregarse.</p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Columna id="pendiente" titulo="🕒 Pendiente" contador={pendientes.length}
            vacio="Nada pendiente de enviar. Aquí caen los contenidos recién añadidos." colorBorde="var(--text-muted)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {pendientes.map((r) => <Tarjeta key={r.id} r={r} alerta={false} desde={0} onRecordar={recordar} onBorrar={borrar} onEditar={editar} tipoObj={tipoObj} />)}
          </Columna>
          <Columna id="enviado" titulo="📤 Enviado" contador={enviados.length}
            vacio="Arrastra aquí un pendiente cuando se lo mandes a la modelo." colorBorde="var(--accent)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {enviados.map((r) => {
              const desde = diasDesde(r.recordado_en || r.enviado_en)
              return <Tarjeta key={r.id} r={r} alerta={desde >= DIAS_ALERTA} desde={desde} onRecordar={recordar} onBorrar={borrar} onEditar={editar} tipoObj={tipoObj} />
            })}
          </Columna>
          <Columna id="hecho" titulo="✅ Hecho" contador={hechos.length}
            vacio="Arrastra aquí cuando la modelo entregue el contenido." colorBorde="var(--success)"
            dragOver={dragOver} setDragOver={setDragOver} onSoltar={soltarEn}>
            {hechos.map((r) => <Tarjeta key={r.id} r={r} alerta={false} desde={0} onRecordar={recordar} onBorrar={borrar} onEditar={editar} tipoObj={tipoObj} />)}
          </Columna>
        </div>
      )}
    </div>
  )
}
