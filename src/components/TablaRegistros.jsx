import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, Select } from './ui'
import CeldaCopia from './CeldaCopia'
import QrCelda from './QrCelda'
import ScrollSuperior from './ScrollSuperior'
import Desplegable from './Desplegable'
import { moverFila, guardarOrden } from '../lib/ordenManual'
import { useAuth } from '../context/AuthContext'
import { PERMISO_IG_CONTRASENAS, PERMISO_IG_2FA } from '../lib/navigation'
import { urlInstagram, usuarioIG } from '../lib/instagramLink'

const vacio = (v) => v === null || v === undefined || v === ''
const cmp = (x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true }))

// Color de la etiqueta de estado según la palabra
function colorEstado(e) {
  const t = String(e || '').toUpperCase()
  if (t.startsWith('ACTIV')) return 'var(--success)'
  if (t.startsWith('ELIMIN')) return 'var(--text-muted)'
  if (t.startsWith('SUSP') || t.startsWith('BLOQ') || t.startsWith('RESTR')) return 'var(--danger)'
  return 'var(--gold)'
}
function Etiqueta({ estado }) {
  const c = colorEstado(estado)
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{estado}</span>
}

// Contraseñas: ocultas por defecto, con ojo para verlas y botón de copiar
// Candado en lugar de la contraseña para quien no tiene el permiso «Ver contraseñas»
function Candado({ que = 'las contraseñas' }) {
  return <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }} data-candado title={`El admin no te ha dado permiso para ver ${que}`}>🔒 No tienes permiso</span>
}

function CeldaSecreto({ valor }) {
  const [ver, setVer] = useState(false)
  const [ok, setOk] = useState(false)
  if (vacio(valor)) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  async function copiar() {
    try { await navigator.clipboard.writeText(String(valor)) } catch {
      const ta = document.createElement('textarea'); ta.value = String(valor); document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* sin portapapeles */ }
      document.body.removeChild(ta)
    }
    setOk(true); setTimeout(() => setOk(false), 1200)
  }
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="font-mono text-xs" style={{ color: ver ? 'var(--text)' : 'var(--text-muted)', letterSpacing: ver ? 0 : 2 }}>{ver ? valor : '••••••••'}</span>
      <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'} title={ver ? 'Ocultar' : 'Ver'} className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>{ver ? '🙈' : '👁'}</button>
      <button type="button" onClick={copiar} aria-label="Copiar contraseña" title="Copiar" className="text-xs px-1 rounded" style={{ color: ok ? 'var(--success)' : 'var(--text-muted)' }}>{ok ? '✓' : '⧉'}</button>
    </div>
  )
}

export default function TablaRegistros({ cfg, canEdit = true, modelos = [], modelosLista = [], personas = [], onRehabilitar, onGuardado, version = 0 }) {
  const { puedeVer } = useAuth()
  const verPass = puedeVer(PERMISO_IG_CONTRASENAS, ['admin', 'ig_manager'])   // permiso adicional «Ver contraseñas»
  const ver2fa = puedeVer(PERMISO_IG_2FA, ['admin', 'ig_manager', 'ig_assistant'])   // permiso adicional «Ver 2FA»
  const es2faBloq = (c) => c.k === 'dos_fa' && !ver2fa
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busca, setBusca] = useState('')
  const [fEstado, setFEstado] = useState('todos')
  const [ordenK, setOrdenK] = useState('orden')
  const [ordenDir, setOrdenDir] = useState('asc')
  const [editId, setEditId] = useState(null)
  const [cerrando, setCerrando] = useState(false)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [arrastrando, setArrastrando] = useState(null)
  const [sobre, setSobre] = useState(null)
  const panelRef = useRef(null)
  const [anchoVista, setAnchoVista] = useState(900)

  const cols = cfg.cols                                  // todas (formulario)
  const colsTabla = cols.filter((c) => !c.soloForm)       // las que salen en la tabla
  const colPrincipal = cols.find((c) => c.principal) || cols[0]
  const nombreModelo = (id) => modelosLista.find((m) => m.id === id)?.stage_name || ''
  const valorDe = (f, k) => (cols.find((c) => c.k === k)?.tipo === 'modeloSel' ? nombreModelo(f[k]) : f[k])
  const [aviso, setAviso] = useState(null)
  const colEstado = cols.find((c) => c.tipo === 'estado')?.k

  async function cargar() {
    setCargando(true)
    const { data, error: err } = await supabase.from(cfg.tabla).select('*').order('orden', { ascending: true }).limit(5000)
    if (err) setError('No se pudieron cargar los datos: ' + err.message)
    setFilas(data || [])
    setCargando(false)
  }
  useEffect(() => { setEditId(null); setMostrarNuevo(false); setBusca(''); setFEstado('todos'); setOrdenK('orden'); setOrdenDir('asc'); setError(null); cargar() }, [cfg.tabla]) // eslint-disable-line

  useEffect(() => { if (version) cargar() }, [version]) // eslint-disable-line

  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const medir = () => setAnchoVista(Math.max(320, el.clientWidth - 2))
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [cargando, cfg.tabla])

  const conteos = useMemo(() => {
    const m = {}
    if (colEstado) filas.forEach((f) => { const e = f[colEstado] || 'SIN ESTADO'; m[e] = (m[e] || 0) + 1 })
    return m
  }, [filas, colEstado])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = filas.filter((f) => {
      if (fEstado !== 'todos' && (f[colEstado] || 'SIN ESTADO') !== fEstado) return false
      if (q && !colsTabla.some((c) => c.tipo !== 'secreto' && !es2faBloq(c) && String(valorDe(f, c.k) ?? '').toLowerCase().includes(q))) return false
      return true
    })
    const dir = ordenDir === 'asc' ? 1 : -1
    return lista.sort((a, b) => {
      const va = valorDe(a, ordenK), vb = valorDe(b, ordenK)
      if (vacio(va) !== vacio(vb)) return vacio(va) ? 1 : -1
      if (vacio(va)) return (a.orden - b.orden)
      const c = cmp(typeof va === 'string' ? va.toLowerCase() : va, typeof vb === 'string' ? vb.toLowerCase() : vb)
      return c ? c * dir : a.orden - b.orden
    })
  }, [filas, busca, fEstado, ordenK, ordenDir]) // eslint-disable-line

  // Orden manual: solo con el orden «manual» (ascendente) y sin búsqueda ni filtro, para que la lista que se ve sea la lista completa
  const puedeArrastrar = canEdit && ordenK === 'orden' && ordenDir === 'asc' && !busca.trim() && fEstado === 'todos' && !editId
  async function soltar(haciaId) {
    const desde = arrastrando
    setArrastrando(null); setSobre(null)
    if (!desde || desde === haciaId) return
    const { lista, cambios } = moverFila(visibles, desde, haciaId)
    if (!cambios.length) return
    setFilas((prev) => prev.map((r) => lista.find((x) => x.id === r.id) || r))   // se ve al instante
    const err = await guardarOrden(cfg.tabla, cambios)
    if (err) { setError('No se pudo guardar el orden: ' + err.message); cargar() }
  }

  function ordenarPor(k) { if (k === ordenK) setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setOrdenK(k); setOrdenDir('asc') } }

  const formVacio = () => { const f = {}; cols.forEach((c) => { f[c.k] = cfg.nuevo?.[c.k] ?? '' }); return f }
  function nuevo() { setEditId(null); setCerrando(false); setForm(formVacio()); setError(null); setMostrarNuevo(true) }
  function editar(f) {
    setMostrarNuevo(false); setCerrando(false); setError(null); setEditId(f.id)
    const x = {}; cols.forEach((c) => { x[c.k] = f[c.k] ?? '' }); setForm(x)
  }
  const cerrar = () => setCerrando(true)
  const finCierre = () => { setEditId(null); setCerrando(false); setError(null) }

  async function guardar(e) {
    e.preventDefault()
    setError(null); setGuardando(true)
    const payload = {}
    cols.forEach((c) => { const v = typeof form[c.k] === 'string' ? form[c.k].trim() : form[c.k]; payload[c.k] = vacio(v) ? null : v })
    const { data: guardada, error: err } = editId
      ? await supabase.from(cfg.tabla).update(payload).eq('id', editId).select().single()
      : await supabase.from(cfg.tabla).insert([payload]).select().single()
    if (err) { setGuardando(false); setError('No se pudo guardar: ' + err.message); return }
    // Gancho opcional (Cuentas propias → General): devuelve un aviso con lo que ha hecho
    setAviso(null)
    if (onGuardado && guardada) { try { setAviso(await onGuardado(guardada)) } catch (ex) { setAviso({ tipo: 'error', texto: 'Se guardó, pero no se pudo actualizar el General: ' + ex.message }) } }
    setGuardando(false)
    if (editId) cerrar(); else { setMostrarNuevo(false); setForm(formVacio()) }
    cargar()
  }

  async function borrar(f) {
    const nombre = f[colPrincipal.k] || cfg.singular
    if (!confirm(`¿Eliminar «${nombre}» de ${cfg.pestana.toLowerCase()}?\n\nNo se puede deshacer.`)) return
    const { error: err } = await supabase.from(cfg.tabla).delete().eq('id', f.id)
    if (err) { setError('No se pudo eliminar: ' + err.message); return }
    if (editId === f.id) finCierre()
    cargar()
  }

  // Un campo del formulario según su tipo
  const campo = (c) => {
    const val = form[c.k] ?? ''
    const set = (v) => setForm((p) => ({ ...p, [c.k]: v }))
    let control
    if (c.tipo === 'fecha') control = <Input type="date" value={val} onChange={(e) => set(e.target.value)} />
    else if (c.tipo === 'estado') {
      const ops = cfg.estados.includes(val) || !val || (cfg.prohibidos || []).includes(String(val).toUpperCase()) ? cfg.estados : [...cfg.estados, val]
      control = <Select value={val} onChange={(e) => set(e.target.value)}><option value="">Sin estado</option>{ops.map((o) => <option key={o} value={o}>{o}</option>)}</Select>
    } else if (c.tipo === 'persona') {
      const todos = personas.flatMap((g) => g.items)
      control = (
        <Select value={val} onChange={(e) => set(e.target.value)}>
          <option value="">Sin indicar</option>
          {val && !todos.includes(val) && <optgroup label="Valor actual"><option value={val}>{val}</option></optgroup>}
          {personas.filter((g) => g.items.length).map((g) => <optgroup key={g.grupo} label={g.grupo}>{g.items.map((n) => <option key={g.grupo + n} value={n}>{n}</option>)}</optgroup>)}
        </Select>
      )
    } else if (c.tipo === 'modeloSel') {
      control = <Select value={val} onChange={(e) => set(e.target.value)}><option value="">Sin modelo asignada</option>{modelosLista.slice().sort((x, y) => String(x.stage_name).localeCompare(String(y.stage_name), 'es')).map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}</Select>
    } else if (c.tipo === 'modelo') control = <Input list="lista-modelos-ig" value={val} onChange={(e) => set(e.target.value)} placeholder="Modelo" />
    else if (c.tipo === 'largo') control = <textarea rows={2} value={val} onChange={(e) => set(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }} />
    else if (es2faBloq(c)) control = <div className="px-3 py-2 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Candado que="el 2FA" /></div>
    else if (c.tipo === 'secreto' && !verPass) control = <div className="px-3 py-2 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><Candado /></div>
    else control = <Input value={val} onChange={(e) => set(e.target.value)} style={c.tipo === 'secreto' || c.mono ? { fontFamily: 'ui-monospace, monospace' } : undefined} />
    return (
      <div key={c.k} className={c.tipo === 'largo' || c.ancho === 2 ? 'sm:col-span-2' : ''}>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{c.n}</label>
        {control}
      </div>
    )
  }
  const formulario = (
    <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cols.map(campo)}
      {error && <p className="sm:col-span-2 lg:col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : `Guardar ${cfg.singular}`}</Button>
        <Button type="button" variant="ghost" onClick={() => (editId ? cerrar() : setMostrarNuevo(false))}>Cancelar</Button>
      </div>
    </form>
  )

  const celda = (f, c, ocultar) => {
    const v = f[c.k]
    if (ocultar) return null
    if (c.usuarioIG && v) {
      const url = urlInstagram(v)
      const cuerpoIG = <CeldaCopia completo titulo={c.n} texto={usuarioIG(v)}>{url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} title="Abrir la cuenta de Instagram">{v}</a> : null}</CeldaCopia>
      return cuerpoIG
    }
    if (c.enlaceDe && v) {
      const url = f[c.enlaceDe]
      return <CeldaCopia completo titulo={c.n} texto={v}>{url ? <a href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }} title="Abrir la cuenta">{v}</a> : null}</CeldaCopia>
    }
    let cuerpo
    if (c.tipo === 'modeloSel') cuerpo = <CeldaCopia completo titulo={c.n} texto={nombreModelo(v)} />
    else if (c.tipo === 'secreto') cuerpo = verPass ? <CeldaSecreto valor={v} /> : <Candado />
    else if (c.tipo === 'estado') cuerpo = vacio(v) ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <Etiqueta estado={v} />
    else if (c.tipo === 'enlace') cuerpo = <CeldaCopia completo titulo={c.n} texto={v} muted>{v ? <a href={v} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> : null}</CeldaCopia>
    else if (c.tipo === 'fecha') cuerpo = <CeldaCopia completo titulo={c.n} texto={v ? String(v).split('-').reverse().join('/') : ''} />
    else cuerpo = <CeldaCopia completo={!c.w} titulo={c.n} texto={v} muted={c.tipo === 'largo' || c.w} >{c.mono && v ? <span className="font-mono tracking-wide">{v}</span> : null}</CeldaCopia>
    if (es2faBloq(c)) cuerpo = <Candado que="el 2FA" />
    else if (c.qrDe) cuerpo = <div className="flex items-center gap-2" style={{ minWidth: 0 }}><div style={{ minWidth: 0, flex: '1 1 auto' }}>{cuerpo}</div><QrCelda usuario={f[c.qrDe]} canEdit={canEdit} /></div>
    return cuerpo
  }
  const tdStyle = (c, i) => ({
    ...(c.w ? { width: c.w, maxWidth: c.w } : { whiteSpace: 'nowrap' }),
    ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 5, background: 'var(--panel)' } : {}),
  })
  const nCols = colsTabla.length + 1
  // Stock: la fecha y el proveedor solo se muestran en la primera fila de cada compra (las siguientes quedan en blanco)
  const agrupar = !!cfg.agrupar && !busca.trim() && fEstado === 'todos' && ['orden', ...(cfg.agrupar || [])].includes(ordenK)
  const mismaCompra = (a, b) => !!a && !!b && cfg.agrupar.every((k) => (a[k] ?? '') === (b[k] ?? ''))

  return (
    <div>
      <style>{`
        .tabla-reg tbody tr.fila-reg { transition: background-color .2s ease; }
        .tabla-reg tbody tr.fila-reg:hover > td { background: var(--panel-alt) !important; }
        .tabla-reg tbody tr.fila-reg.editando > td { background: color-mix(in srgb, var(--accent) 14%, var(--panel)) !important; }
        .tabla-reg tbody tr.sobre > td { box-shadow: inset 0 3px 0 0 var(--accent); }
        .tabla-reg tbody tr.arrastrada { opacity: .45; }
        .tabla-reg thead th { text-transform: uppercase; letter-spacing: .06em; font-size: 11px; }
      `}</style>
      <datalist id="lista-modelos-ig">{modelos.map((m) => <option key={m} value={m} />)}</datalist>

      {mostrarNuevo && !editId && (
        <Panel className="p-5 mb-5">
          <p className="text-sm mb-4 font-medium">Nueva {cfg.singular}</p>
          {formulario}
        </Panel>
      )}

      <Panel ref={panelRef} className="overflow-hidden" style={{ boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
        <div className="px-4 py-3" style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow basis-52"><Input placeholder="🔎 Buscar en esta tabla…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
            {colEstado && (
              <div className="w-48">
                <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Estado">
                  <option value="todos">Estado: todos</option>
                  {Object.keys(conteos).sort().map((e) => <option key={e} value={e}>{e} ({conteos[e]})</option>)}
                </Select>
              </div>
            )}
            <div className="w-56">
              <Select value={ordenK} onChange={(e) => { setOrdenK(e.target.value); setOrdenDir('asc') }} aria-label="Ordenar por">
                <option value="orden">Orden manual (arrastrar filas)</option>
                {colsTabla.filter((c) => c.tipo !== 'secreto' && !es2faBloq(c)).map((c) => <option key={c.k} value={c.k}>Ordenar: {c.n}</option>)}
              </Select>
            </div>
            <button type="button" onClick={() => setOrdenDir((d) => (d === 'asc' ? 'desc' : 'asc'))} className="px-3 py-2 rounded-md text-sm whitespace-nowrap" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>{ordenDir === 'asc' ? '▲ A→Z' : '▼ Z→A'}</button>
            {canEdit && !editId && !cfg.sinAnadir && <Button onClick={mostrarNuevo ? () => setMostrarNuevo(false) : nuevo}>{mostrarNuevo ? 'Cancelar' : `+ Añadir ${cfg.singular}`}</Button>}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <span>{visibles.length} de {filas.length}</span>
            {colEstado && Object.keys(conteos).sort().map((e) => (
              <button key={e} type="button" onClick={() => setFEstado(fEstado === e ? 'todos' : e)} className="px-2 py-0.5 rounded-full" style={{ border: `1px solid ${fEstado === e ? colorEstado(e) : 'var(--border)'}`, color: colorEstado(e) }}>{e} · {conteos[e]}</button>
            ))}
            {(busca || fEstado !== 'todos' || ordenK !== 'orden') && <button type="button" className="underline" onClick={() => { setBusca(''); setFEstado('todos'); setOrdenK('orden'); setOrdenDir('asc') }}>Restablecer</button>}
          </div>
        </div>
        {aviso && <p className="px-4 py-2 text-sm flex items-center gap-3" style={{ color: aviso.tipo === 'error' ? 'var(--danger)' : 'var(--success)', background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}><span className="flex-1">{aviso.tipo === 'error' ? '⚠️ ' : '✅ '}{aviso.texto}</span><button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">✕</button></p>}
        {error && !mostrarNuevo && !editId && <p className="px-4 py-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        {cargando ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p> : (
          <ScrollSuperior>
            <table className="tabla-reg text-sm" style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
                  {colsTabla.map((c, i) => (
                    <th key={c.k} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: ordenK === c.k ? 'var(--accent)' : 'var(--text-muted)', ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 6, background: 'var(--panel)' } : {}) }}>
                      {c.tipo === 'secreto' || es2faBloq(c) ? c.n : <button type="button" onClick={() => ordenarPor(c.k)} className="hover:underline uppercase" title="Ordenar por esta columna">{c.n}{ordenK === c.k ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : ''}</button>}
                    </th>
                  ))}
                  <th style={{ position: 'sticky', right: 0, zIndex: 6, background: 'var(--panel)', borderLeft: '1px solid var(--border)' }} />
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr><td colSpan={nCols} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>{filas.length ? 'Nada coincide con los filtros.' : cfg.vacio}</td></tr>
                ) : visibles.map((f, idx) => {
                  const continua = agrupar && mismaCompra(f, visibles[idx - 1])
                  const inicio = agrupar && idx > 0 && !continua
                  return (
                  <Fragment key={f.id}>
                    <tr className={`fila-reg${editId === f.id ? ' editando' : ''}${sobre === f.id && arrastrando && arrastrando !== f.id ? ' sobre' : ''}${arrastrando === f.id ? ' arrastrada' : ''}`}
                      onDragOver={puedeArrastrar && arrastrando ? (e) => { e.preventDefault(); if (sobre !== f.id) setSobre(f.id) } : undefined}
                      onDrop={puedeArrastrar && arrastrando ? (e) => { e.preventDefault(); soltar(f.id) } : undefined}
                      style={{ borderBottom: editId === f.id ? 'none' : '1px solid var(--border)', borderTop: inicio ? '2px solid color-mix(in srgb, var(--accent) 45%, var(--border))' : undefined, height: 54 }}>
                      {colsTabla.map((c, i) => (
                        <td key={c.k} className={`px-4 align-middle${i === 0 ? ' font-medium' : ''}`} style={tdStyle(c, i)}>
                          {i === 0 && puedeArrastrar ? (
                            <div className="flex items-center gap-2">
                              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); const tr = e.currentTarget.closest('tr'); if (tr) e.dataTransfer.setDragImage(tr, 24, 20); setArrastrando(f.id) }} onDragEnd={() => { setArrastrando(null); setSobre(null) }}
                                className="cursor-grab select-none" style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }} title="Arrastra para cambiar el orden" aria-label="Arrastrar para ordenar">⠿</span>
                              {celda(f, c, continua && cfg.agrupar?.includes(c.k))}
                            </div>
                          ) : celda(f, c, continua && cfg.agrupar?.includes(c.k))}
                        </td>
                      ))}
                      <td className="px-4 align-middle" style={{ position: 'sticky', right: 0, zIndex: 5, background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}>
                        <div className="flex gap-3 whitespace-nowrap">
                          {canEdit && cfg.rehabilitar && onRehabilitar && <button onClick={() => onRehabilitar(f)} className="text-xs hover:underline" style={{ color: 'var(--success)' }} title="Devolver la cuenta al cuadro General">Rehabilitar</button>}
                          {canEdit && <button onClick={() => (editId === f.id ? cerrar() : editar(f))} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>{editId === f.id && !cerrando ? 'Cerrar' : 'Editar'}</button>}
                          {canEdit && <button onClick={() => borrar(f)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                    {editId === f.id && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={nCols} style={{ padding: 0, background: 'var(--panel-alt)' }}>
                          <div style={{ position: 'sticky', left: 0, width: anchoVista }}>
                            <Desplegable abierto={!cerrando} onCerrado={finCierre}>
                              <div className="p-5">
                                <p className="text-sm mb-4 font-medium">Editar {f[colPrincipal.k] || cfg.singular}</p>
                                {formulario}
                              </div>
                            </Desplegable>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </ScrollSuperior>
        )}
      </Panel>
    </div>
  )
}
