import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

// ---------------------------------------------------------------------------
// «Lo que funciona»
//  - Registro manual: la misma estructura del Excel «Registro de reels ganadores»
//    (columnas A-K se rellenan; seguidores por 1.000, veredicto y tipo de conversión se calculan solos).
//  - Resumen y Top 10: lo que hacían las pestañas Resumen y Top 10 del Excel, más rankings por formato y gancho.
//  - Automático (scrapper): la estructura anterior, que se alimenta de la tabla «reels». No se ha tocado.
// ---------------------------------------------------------------------------

const CFG_DEFECTO = { umbral_estrella: 12, umbral_ganador: 7, umbral_apoyo: 2, dias_espera: 7, visitas_buenas: 0.05, visitas_malas: 0.01, formatos: [], ganchos: [] }
const TIPOS = [{ id: 'marca_personal', n: 'Marca personal' }, { id: 'sugerente', n: 'Sugerente' }]
const nTipo = (id) => TIPOS.find((t) => t.id === id)?.n || '—'
const MEDIDOS = ['Estrella', 'Ganador', 'Apoyo', 'Perdedor']
const GANADORES = ['Estrella', 'Ganador']
const COLOR_VEREDICTO = { Estrella: 'var(--gold)', Ganador: 'var(--success)', Apoyo: 'var(--accent)', Perdedor: 'var(--danger)', Revisar: 'var(--text-muted)' }

const EMPTY = { id: null, account_id: '', fecha: '', pie: '', que_pasa: '', formato: '', gancho: '', duracion_seg: '', tipo: '', espectadores: '', nuevos_seguidores: '', visitas_perfil: '', prueba: false }

const sinArroba = (u) => String(u || '').replace(/^@/, '')
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null }
const fmt = (n, d = 1) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: d }))
const fmtF = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
function hoyISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function diasDesde(iso) { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000) }

// Mismas fórmulas que el Excel (columnas L, M, N y O)
function calcular(r, cfg) {
  const h = num(r.espectadores), i = num(r.nuevos_seguidores), j = num(r.visitas_perfil)
  const por1000 = h !== null && i !== null && h !== 0 ? (i / h) * 1000 : null
  const visitas = h !== null && j !== null && h !== 0 ? j / h : null
  let veredicto = ''
  if (por1000 !== null) {
    if (r.prueba) veredicto = 'Revisar'
    else if (r.fecha && diasDesde(r.fecha) < cfg.dias_espera) veredicto = `Esperar ${cfg.dias_espera} días`
    else if (por1000 >= cfg.umbral_estrella) veredicto = 'Estrella'
    else if (por1000 >= cfg.umbral_ganador) veredicto = 'Ganador'
    else if (por1000 >= cfg.umbral_apoyo) veredicto = 'Apoyo'
    else veredicto = 'Perdedor'
  }
  let conversion = ''
  if (por1000 !== null) {
    if (por1000 >= cfg.umbral_apoyo) conversion = 'Seguidores'
    else if (visitas === null) conversion = 'Sin conversión clara'
    else conversion = visitas >= cfg.visitas_buenas ? 'Visitas al perfil' : 'Sin conversión clara'
  }
  return { por1000, visitas, veredicto, conversion }
}

const listaATexto = (l) => (l || []).map((x) => `${x.nombre}${x.significado ? ' | ' + x.significado : ''}`).join('\n')
const textoALista = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n, ...s] = l.split('|'); return { nombre: n.trim(), significado: s.join('|').trim() } }).filter((x) => x.nombre)

function Badge({ v }) {
  if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = COLOR_VEREDICTO[v] || 'var(--text-muted)'
  return <span className="px-2 py-0.5 rounded-full text-xs whitespace-nowrap" style={{ background: `${color}22`, color }}>{v}</span>
}

export default function WhatWorks() {
  const { hasAnyRole } = useAuth()
  const puedeEditar = hasAnyRole(['admin', 'ig_manager', 'ig_assistant'])
  const puedeAjustar = hasAnyRole(['admin', 'ig_manager'])
  const [tab, setTab] = useState('registro')
  const [cuentas, setCuentas] = useState([])
  const [reels, setReels] = useState([])
  const [cfg, setCfg] = useState(CFG_DEFECTO)
  const [loading, setLoading] = useState(true)
  const [fCuenta, setFCuenta] = useState('todas')
  const [fVeredicto, setFVeredicto] = useState('todos')
  const [fTipo, setFTipo] = useState('todos')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verGuia, setVerGuia] = useState(false)
  const [verAjustes, setVerAjustes] = useState(false)
  const [aj, setAj] = useState(null)
  const [ajMsg, setAjMsg] = useState('')

  async function cargar() {
    setLoading(true)
    const [{ data: c }, { data: r }, { data: cf }] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username, models(stage_name)').order('username'),
      supabase.from('winning_reels').select('*').order('fecha', { ascending: false, nullsFirst: false }).limit(5000),
      supabase.from('reel_config').select('*').eq('id', 1).maybeSingle(),
    ])
    setCuentas(c || [])
    setReels(r || [])
    if (cf) setCfg({ ...CFG_DEFECTO, ...cf, umbral_estrella: Number(cf.umbral_estrella), umbral_ganador: Number(cf.umbral_ganador), umbral_apoyo: Number(cf.umbral_apoyo), visitas_buenas: Number(cf.visitas_buenas), visitas_malas: Number(cf.visitas_malas) })
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const usuarioDe = (id) => sinArroba(cuentas.find((c) => c.id === id)?.username)
  const filas = useMemo(() => reels.map((r) => ({ ...r, ...calcular(r, cfg) })), [reels, cfg])
  const visibles = useMemo(
    () => filas.filter((r) => (fCuenta === 'todas' || r.account_id === fCuenta)
      && (fTipo === 'todos' || r.tipo === fTipo)
      && (fVeredicto === 'todos' || (fVeredicto === 'esperar' ? r.veredicto.startsWith('Esperar') : r.veredicto === fVeredicto))),
    [filas, fCuenta, fVeredicto, fTipo],
  )

  // ---------- alta / edición ----------
  function nuevo() {
    setError('')
    setForm({ ...EMPTY, account_id: fCuenta !== 'todas' ? fCuenta : (cuentas[0]?.id || ''), fecha: hoyISO() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function editar(r) {
    setError('')
    const f = { ...EMPTY }
    Object.keys(EMPTY).forEach((k) => { f[k] = r[k] === null || r[k] === undefined ? (k === 'prueba' ? false : '') : r[k] })
    f.fecha = r.fecha || ''
    setForm(f)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!form.account_id) { setError('Elige la cuenta.'); return }
    if (!form.pie.trim() && !form.que_pasa.trim()) { setError('Escribe al menos el pie del reel o qué pasa en el reel, para poder reconocerlo.'); return }
    setGuardando(true)
    const payload = {
      account_id: form.account_id, fecha: form.fecha || null, pie: form.pie.trim() || null, que_pasa: form.que_pasa.trim() || null,
      formato: form.formato || null, gancho: form.gancho || null, duracion_seg: num(form.duracion_seg), tipo: form.tipo || null,
      espectadores: num(form.espectadores), nuevos_seguidores: num(form.nuevos_seguidores), visitas_perfil: num(form.visitas_perfil), prueba: !!form.prueba,
    }
    const { error: err } = form.id
      ? await supabase.from('winning_reels').update(payload).eq('id', form.id)
      : await supabase.from('winning_reels').insert([payload])
    setGuardando(false)
    if (err) { setError(err.message.includes('does not exist') ? 'Falta ejecutar la migración 44 en Supabase.' : 'No se pudo guardar. Revisa que tengas acceso a esa cuenta.'); return }
    setForm(null)
    cargar()
  }
  async function borrar(r) {
    if (!confirm('¿Borrar este reel del registro? No se puede deshacer.')) return
    const { error: err } = await supabase.from('winning_reels').delete().eq('id', r.id)
    if (err) { alert('No se pudo borrar.'); return }
    cargar()
  }
  const previa = form ? calcular(form, cfg) : null
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const opciones = (lista, actual) => {
    const nombres = lista.map((x) => x.nombre)
    return actual && !nombres.includes(actual) ? [...nombres, actual] : nombres
  }

  // ---------- ajustes (pestaña «Listas» del Excel) ----------
  function abrirAjustes() {
    setAjMsg('')
    setAj({
      umbral_estrella: String(cfg.umbral_estrella), umbral_ganador: String(cfg.umbral_ganador), umbral_apoyo: String(cfg.umbral_apoyo),
      dias_espera: String(cfg.dias_espera), visitas_buenas: String(cfg.visitas_buenas * 100), visitas_malas: String(cfg.visitas_malas * 100),
      formatos: listaATexto(cfg.formatos), ganchos: listaATexto(cfg.ganchos),
    })
    setVerAjustes(true)
  }
  async function guardarAjustes() {
    setAjMsg('')
    const payload = {
      id: 1, umbral_estrella: num(aj.umbral_estrella) ?? 12, umbral_ganador: num(aj.umbral_ganador) ?? 7, umbral_apoyo: num(aj.umbral_apoyo) ?? 2,
      dias_espera: Math.round(num(aj.dias_espera) ?? 7), visitas_buenas: (num(aj.visitas_buenas) ?? 5) / 100, visitas_malas: (num(aj.visitas_malas) ?? 1) / 100,
      formatos: textoALista(aj.formatos), ganchos: textoALista(aj.ganchos), updated_at: new Date().toISOString(),
    }
    const { error: err } = await supabase.from('reel_config').upsert(payload, { onConflict: 'id' })
    if (err) { setAjMsg('No se pudo guardar. ¿Ejecutaste la migración 44?'); return }
    setAjMsg('Guardado. Los veredictos se han recalculado con los nuevos umbrales.')
    cargar()
  }

  // ---------- resumen ----------
  const medidos = useMemo(() => filas.filter((r) => MEDIDOS.includes(r.veredicto)), [filas])
  const porCuenta = useMemo(() => {
    return cuentas.map((c) => {
      const mias = filas.filter((r) => r.account_id === c.id)
      const med = mias.filter((r) => MEDIDOS.includes(r.veredicto))
      const gan = mias.filter((r) => GANADORES.includes(r.veredicto)).length
      return { id: c.id, usuario: sinArroba(c.username), total: mias.length, gan, pct: mias.length ? gan / mias.length : null, media: med.length ? med.reduce((a, r) => a + r.por1000, 0) / med.length : null }
    }).filter((x) => x.total > 0)
  }, [cuentas, filas])
  function ranking(campo) {
    const g = {}
    medidos.forEach((r) => {
      const k = (campo === 'tipo' ? nTipo(r.tipo) : r[campo]) || 'Sin indicar'
      ;(g[k] = g[k] || []).push(r)
    })
    return Object.entries(g).map(([nombre, rs]) => ({ nombre, n: rs.length, gan: rs.filter((r) => GANADORES.includes(r.veredicto)).length, media: rs.reduce((a, r) => a + r.por1000, 0) / rs.length })).sort((a, b) => b.media - a.media)
  }
  const top10 = useMemo(() => filas.filter((r) => GANADORES.includes(r.veredicto)).sort((a, b) => b.por1000 - a.por1000).slice(0, 10), [filas])

  const TABS = [['registro', 'Registro de reels'], ['resumen', 'Resumen y Top 10'], ['auto', 'Automático (scrapper)']]

  return (
    <div>
      <PageHeader
        title="Lo que funciona"
        subtitle="Registro de los reels que mejor han funcionado, con el veredicto calculado igual que en tu Excel."
        action={puedeEditar && tab === 'registro' && <Button onClick={nuevo} disabled={!cuentas.length}>Añadir reel</Button>}
      />

      <div className="flex rounded-md overflow-hidden mb-6 w-fit max-w-full overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
        {TABS.map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2 text-sm whitespace-nowrap" style={{ background: tab === k ? 'var(--accent-soft)' : 'transparent', color: tab === k ? 'var(--accent)' : 'var(--text-muted)' }}>{t}</button>
        ))}
      </div>

      {tab === 'auto' && <Automatico />}

      {tab !== 'auto' && (loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : tab === 'registro' ? (
        <>
          {form && (
            <Panel className="p-5 mb-6">
              <p className="text-sm font-medium mb-1">{form.id ? 'Editar reel' : 'Añadir reel'}</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Apunta el reel cuando lleve {cfg.dias_espera} días o más publicado: antes, los números están a medias.</p>
              <form onSubmit={guardar}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Cuenta</label>
                    <Select value={form.account_id} onChange={(e) => setF('account_id', e.target.value)}>
                      <option value="">— Elegir cuenta —</option>
                      {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Fecha de subida</label>
                    <Input type="date" value={form.fecha} onChange={(e) => setF('fecha', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Marca personal o sugerente</label>
                    <Select value={form.tipo} onChange={(e) => setF('tipo', e.target.value)}>
                      <option value="">— Elegir —</option>
                      {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Pie del reel (texto que aparece debajo del vídeo)</label>
                    <textarea value={form.pie} onChange={(e) => setF('pie', e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Qué pasa en el reel (1 línea; si es solo texto, pégalo aquí)</label>
                    <textarea value={form.que_pasa} onChange={(e) => setF('que_pasa', e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Formato</label>
                    <Select value={form.formato} onChange={(e) => setF('formato', e.target.value)}>
                      <option value="">— Elegir —</option>
                      {opciones(cfg.formatos, form.formato).map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Gancho (qué engancha en el primer segundo)</label>
                    <Select value={form.gancho} onChange={(e) => setF('gancho', e.target.value)}>
                      <option value="">— Elegir —</option>
                      {opciones(cfg.ganchos, form.gancho).map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Duración (segundos)</label>
                    <Input type="number" min={0} step="any" value={form.duracion_seg} onChange={(e) => setF('duracion_seg', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Espectadores (o cuentas alcanzadas)</label>
                    <Input type="number" min={0} step="any" value={form.espectadores} onChange={(e) => setF('espectadores', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Nuevos seguidores</label>
                    <Input type="number" min={0} step="any" value={form.nuevos_seguidores} onChange={(e) => setF('nuevos_seguidores', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Visitas al perfil</label>
                    <Input type="number" min={0} step="any" value={form.visitas_perfil} onChange={(e) => setF('visitas_perfil', e.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm mb-4">
                  <input type="checkbox" checked={form.prueba} onChange={(e) => setF('prueba', e.target.checked)} />
                  Reel de prueba de Instagram, o el reel pide seguir a cambio de algo («sígueme y te mando…»)
                </label>
                <div className="p-3 rounded-md mb-4 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ background: 'var(--panel-alt)', border: '1px dashed var(--border)' }}>
                  <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Seguidores por 1.000</p><p className="font-display text-lg font-semibold tabular-nums">{fmt(previa.por1000, 2)}</p></div>
                  <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Visitas al perfil / espectadores</p><p className="font-display text-lg font-semibold tabular-nums">{previa.visitas === null ? '—' : fmt(previa.visitas * 100, 2) + '%'}</p></div>
                  <div><p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Veredicto</p><Badge v={previa.veredicto} /></div>
                  <div><p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de conversión</p><p className="text-sm">{previa.conversion || '—'}</p></div>
                </div>
                {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar reel'}</Button>
                  <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                </div>
              </form>
            </Panel>
          )}

          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="min-w-[180px]">
              <Select value={fCuenta} onChange={(e) => setFCuenta(e.target.value)}>
                <option value="todas">Todas las cuentas</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>@{sinArroba(c.username)}</option>)}
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Select value={fVeredicto} onChange={(e) => setFVeredicto(e.target.value)}>
                <option value="todos">Todos los veredictos</option>
                {['Estrella', 'Ganador', 'Apoyo', 'Perdedor', 'Revisar'].map((v) => <option key={v} value={v}>{v}</option>)}
                <option value="esperar">Esperando {cfg.dias_espera} días</option>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                <option value="todos">Marca personal y sugerente</option>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}
              </Select>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{visibles.length} reels</span>
            <div className="ml-auto flex gap-4 text-sm">
              <button className="underline" style={{ color: 'var(--text-muted)' }} onClick={() => setVerGuia(!verGuia)}>{verGuia ? 'Ocultar guía' : 'Cómo rellenarlo'}</button>
              {puedeAjustar && <button className="underline" style={{ color: 'var(--text-muted)' }} onClick={() => (verAjustes ? setVerAjustes(false) : abrirAjustes())}>{verAjustes ? 'Cerrar ajustes' : 'Umbrales y listas'}</button>}
            </div>
          </div>

          {verGuia && (
            <Panel className="p-5 mb-4 text-sm">
              <p className="font-medium mb-2">4 reglas</p>
              <ul className="list-disc pl-5 mb-4 space-y-1" style={{ color: 'var(--text-muted)' }}>
                <li>Cada reel es una fila. Apúntalo cuando lleve {cfg.dias_espera} días o más publicado.</li>
                <li>En «Espectadores» usa Espectadores (o Cuentas alcanzadas, es lo mismo). Nunca Reproducciones.</li>
                <li>Los datos salen de las estadísticas del reel en Instagram: Descripción (espectadores y nuevos seguidores) e Interacción (visitas al perfil). La duración es el final de la gráfica de tiempo visto (0:15 = 15).</li>
                <li>Marca la casilla de prueba solo si Instagram lo marca como «Reel de prueba» o si el reel dice «sígueme y te mando…». Esos salen como «Revisar» y no cuentan como ganadores.</li>
              </ul>
              <p className="font-medium mb-2">Qué se calcula solo</p>
              <ul className="list-disc pl-5 space-y-1" style={{ color: 'var(--text-muted)' }}>
                <li><strong>Seguidores por 1.000</strong> = Nuevos seguidores ÷ Espectadores × 1.000.</li>
                <li><strong>Visitas al perfil / espectadores</strong> = Visitas al perfil ÷ Espectadores.</li>
                <li><strong>Veredicto</strong>: Estrella ({fmt(cfg.umbral_estrella, 2)} o más), Ganador ({fmt(cfg.umbral_ganador, 2)} a {fmt(cfg.umbral_estrella, 2)}), Apoyo ({fmt(cfg.umbral_apoyo, 2)} a {fmt(cfg.umbral_ganador, 2)}) o Perdedor (menos de {fmt(cfg.umbral_apoyo, 2)}). «Revisar» si es reel de prueba; «Esperar {cfg.dias_espera} días» si lleva menos tiempo publicado.</li>
                <li><strong>Tipo de conversión</strong>: Seguidores ({fmt(cfg.umbral_apoyo, 2)} o más por 1.000), Visitas al perfil (entra mucha gente pero siguen pocos) o Sin conversión clara.</li>
              </ul>
            </Panel>
          )}

          {verAjustes && aj && (
            <Panel className="p-5 mb-4">
              <p className="text-sm font-medium mb-1">Umbrales y listas</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Los umbrales salen del análisis de los reels de Lily (its.lilysummer). Revísalos cuando haya más datos o si los usas en otras cuentas.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[['umbral_estrella', 'Estrella: seguidores por 1.000 desde'], ['umbral_ganador', 'Ganador: seguidores por 1.000 desde'], ['umbral_apoyo', 'Apoyo: seguidores por 1.000 desde'], ['dias_espera', 'Días de espera antes de medir'], ['visitas_buenas', 'Visitas al perfil buenas: desde (%)'], ['visitas_malas', 'Visitas al perfil malas: hasta (%)']].map(([k, t]) => (
                  <div key={k}>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{t}</label>
                    <Input type="number" step="any" value={aj[k]} onChange={(e) => setAj({ ...aj, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {[['formatos', 'Formatos del reel'], ['ganchos', 'Tipos de gancho']].map(([k, t]) => (
                  <div key={k}>
                    <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{t} — una línea por opción: Nombre | Qué significa</label>
                    <textarea value={aj[k]} onChange={(e) => setAj({ ...aj, [k]: e.target.value })} rows={9} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                ))}
              </div>
              {ajMsg && <p className="text-sm mb-3" style={{ color: ajMsg.startsWith('Guardado') ? 'var(--success)' : 'var(--danger)' }}>{ajMsg}</p>}
              <Button onClick={guardarAjustes}>Guardar ajustes</Button>
            </Panel>
          )}

          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Cuenta', 'Pie del reel', 'Qué pasa', 'Formato', 'Gancho', 'Seg.', 'Tipo', 'Espectadores', 'Nuevos seg.', 'Visitas', 'Seg. por 1.000', 'Visitas / esp.', 'Veredicto', 'Conversión', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={16} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>{reels.length === 0 ? 'Todavía no has registrado ningún reel. Pulsa «Añadir reel».' : 'Ningún reel con esos filtros.'}</td></tr>
                )}
                {visibles.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtF(r.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><strong>@{usuarioDe(r.account_id)}</strong></td>
                    <td className="px-3 py-2 max-w-[220px]" title={r.pie || ''}><div className="line-clamp-2">{r.pie || '—'}</div></td>
                    <td className="px-3 py-2 max-w-[260px]" title={r.que_pasa || ''}><div className="line-clamp-2">{r.que_pasa || '—'}</div></td>
                    <td className="px-3 py-2 max-w-[180px]"><div className="line-clamp-2">{r.formato || '—'}</div></td>
                    <td className="px-3 py-2 max-w-[180px]"><div className="line-clamp-2">{r.gancho || '—'}</div></td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.duracion_seg, 0)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{nTipo(r.tipo)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.espectadores, 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.nuevos_seguidores, 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.visitas_perfil, 0)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{fmt(r.por1000, 2)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.visitas === null ? '—' : fmt(r.visitas * 100, 2) + '%'}</td>
                    <td className="px-3 py-2"><Badge v={r.veredicto} /></td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{r.conversion || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {puedeEditar && (
                        <>
                          <button className="text-xs underline mr-3" onClick={() => editar(r)}>Editar</button>
                          <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(r)}>Borrar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      ) : (
        <>
          <Panel className="p-5 mb-6">
            <p className="text-sm font-medium mb-1">Por cuenta</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Ganadores = Ganador + Estrella. La media de seguidores por 1.000 usa solo reels ya medidos (sin «Revisar» ni «Esperar»).</p>
            {porCuenta.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay reels registrados.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Cuenta', 'Reels registrados', 'Ganadores', '% ganadores', 'Media seg. por 1.000'].map((c) => <th key={c} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {porCuenta.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2"><strong>@{c.usuario}</strong></td>
                        <td className="px-3 py-2 tabular-nums">{c.total}</td>
                        <td className="px-3 py-2 tabular-nums">{c.gan}</td>
                        <td className="px-3 py-2 tabular-nums">{c.pct === null ? '—' : fmt(c.pct * 100, 0) + '%'}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(c.media, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {[['formato', 'Qué formatos funcionan mejor'], ['gancho', 'Qué ganchos funcionan mejor'], ['tipo', 'Marca personal vs sugerente']].map(([campo, titulo]) => {
              const rk = ranking(campo)
              return (
                <Panel key={campo} className="p-5">
                  <p className="text-sm font-medium mb-3">{titulo}</p>
                  {rk.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin reels medidos todavía.</p> : (
                    <div className="space-y-2">
                      {rk.map((x, i) => (
                        <div key={x.nombre} className="flex items-center gap-2 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                          <span className="font-display font-semibold gold-text w-5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate" title={x.nombre}>{x.nombre}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{x.n} reel(s) · {x.gan} ganador(es)</p>
                          </div>
                          <strong className="tabular-nums" style={{ color: x.media >= cfg.umbral_ganador ? 'var(--success)' : x.media >= cfg.umbral_apoyo ? 'var(--text)' : 'var(--danger)' }}>{fmt(x.media, 1)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              )
            })}
          </div>

          <Panel className="p-5">
            <p className="text-sm font-medium mb-1">Top 10 reels ganadores</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Solo reels con {cfg.dias_espera}+ días y sin trampas (ni reels de prueba ni «sígueme y te mando»).</p>
            {top10.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay reels ganadores.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Cuenta', 'Pie del reel', 'Qué pasa', 'Formato', 'Gancho', 'Tipo', 'Seg. por 1.000', 'Visitas al perfil'].map((c) => <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 font-display font-semibold gold-text">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap"><strong>@{usuarioDe(r.account_id)}</strong></td>
                        <td className="px-3 py-2 max-w-[220px]"><div className="line-clamp-2">{r.pie || '—'}</div></td>
                        <td className="px-3 py-2 max-w-[260px]"><div className="line-clamp-2">{r.que_pasa || '—'}</div></td>
                        <td className="px-3 py-2 max-w-[160px]">{r.formato || '—'}</td>
                        <td className="px-3 py-2 max-w-[160px]">{r.gancho || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{nTipo(r.tipo)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium" style={{ color: 'var(--success)' }}>{fmt(r.por1000, 2)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.visitas === null ? '—' : fmt(r.visitas * 100, 2) + '%'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estructura anterior, pensada para alimentarse de un scrapper (tabla «reels»). Sin cambios.
// ---------------------------------------------------------------------------
const CATEGORIA_LABEL = { rol: 'Rol / personaje', pregunta_fan: 'Responde pregunta de fan', chiste_texto: 'Chiste de texto', cuerpo_estetica: 'Cuerpo y estética', romantico: 'Conexión romántica', humor_remate: 'Humor con remate', otro: 'Otro' }

function ratio(n, d, mult = 1) { if (!n || !d) return null; return (Number(n) / Number(d)) * mult }

function Automatico() {
  const [reels, setReels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('reels').select('*, instagram_accounts(username)').then(({ data }) => {
      setReels(data || [])
      setLoading(false)
    })
  }, [])

  const conRatio = reels
    .map((r) => ({ ...r, _por1000: ratio(r.seguidores_ganados, r.alcance, 1000) }))
    .filter((r) => r._por1000 !== null)

  const porCategoria = {}
  conRatio.forEach((r) => {
    const cat = r.categoria || 'otro'
    if (!porCategoria[cat]) porCategoria[cat] = []
    porCategoria[cat].push(r._por1000)
  })
  const ranking = Object.entries(porCategoria)
    .map(([cat, valores]) => ({
      categoria: cat,
      media: valores.reduce((a, b) => a + b, 0) / valores.length,
      n: valores.length,
    }))
    .sort((a, b) => b.media - a.media)

  const top10 = [...conRatio].sort((a, b) => b._por1000 - a._por1000).slice(0, 10)

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Qué formatos de reel rinden mejor según los reels de «Envío de reels», consolidado entre todas las cuentas. Es la estructura pensada para alimentarse con un scrapper.</p>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : conRatio.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay suficientes reels con alcance y seguidores registrados en ninguna cuenta.</p>
      ) : (
        <>
          <Panel className="p-5 mb-6">
            <p className="text-sm font-medium mb-4">Ranking de formatos (seguidores por cada 1.000 de alcance, de media)</p>
            <div className="space-y-2">
              {ranking.map((r, i) => (
                <div key={r.categoria} className="flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                  <span className="font-display font-semibold gold-text w-6">{i + 1}</span>
                  <span className="text-sm flex-1">{CATEGORIA_LABEL[r.categoria] || r.categoria}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.n} reel(s)</span>
                  <strong style={{ color: r.media >= 12 ? 'var(--success)' : 'var(--danger)' }}>{r.media.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-medium mb-4">Top 10 reels individuales</p>
            <div className="space-y-2">
              {top10.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                  <div className="flex-1">
                    <p className="text-sm">{r.titulo}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {r.instagram_accounts?.username} · {CATEGORIA_LABEL[r.categoria] || '—'} · {r.fecha_publicacion}
                    </p>
                  </div>
                  <strong style={{ color: 'var(--success)' }}>{r._por1000.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
