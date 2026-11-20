import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { actualizarMetricasIG, consultarCreditosIG, ajustesCreditosIG, guardarAjustesCreditosIG, gastoMesIG } from '../lib/igScrape'
import { Panel, Button, Select } from '../components/ui'
import ScrollSuperior from '../components/ScrollSuperior'
import { urlInstagram } from '../lib/instagramLink'
import { estadoDeCuenta } from '../lib/cuentasIGSecciones'
import IGAccountAnalytics from './IGAccountAnalytics'
import { PanelAlertas, PanelRanking, PanelPublicacion, PanelComparativa } from './IGMetricasExtra'
import { computeAlertas } from '../lib/igAlertas'
import InsigniaVerificada from '../components/InsigniaVerificada'
import { useVerificadasIG, esVerificadaIG, refrescarVerificadas } from '../lib/verificadasIG'

// Las cuentas suspendidas o en reposo no se miden: no aparecen en este cuadro
const SIN_METRICAS = ['SUSPENDIDA', 'EN REPOSO', 'SUSPENDIDA INDEFINIDAMENTE']

const MODOS_REELS = {
  novedad: { corto: 'perfil + reels solo si hay publicaciones nuevas (o cada 7 días)', largo: 'Perfil + reels solo si hay publicaciones nuevas (o cada 7 días)' },
  siempre: { corto: 'perfil + reels en cada lectura', largo: 'Perfil + reels en cada lectura (el más completo)' },
  no: { corto: 'solo el perfil (sin reels)', largo: 'Solo el perfil (el más barato, sin reels)' },
}
const n0 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const n1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const fFecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const fFechaHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const hace = (d) => { if (!d) return '—'; const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} d` }

// Foto de perfil del propio Instagram; si no hay lectura o no carga, la inicial
function FotoIG({ url, nombre, size = 40 }) {
  const [fallo, setFallo] = useState(false)
  const base = { width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0 }
  if (url && !fallo) return <img src={url} alt={nombre} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallo(true)} style={{ ...base, objectFit: 'cover', border: '1px solid var(--border)' }} />
  return <span aria-hidden="true" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 15 }}>{(nombre || '?').charAt(0).toUpperCase()}</span>
}

const GRAFICAS = [
  ['followers', 'Seguidores'], ['engagement_rate', 'Engagement (%)'], ['avg_likes', 'Likes medios'],
  ['avg_comments', 'Comentarios medios'], ['avg_reel_views', 'Vistas medias de reels'], ['posts_count', 'Publicaciones'],
]

function Delta({ actual, anterior }) {
  if (actual == null || anterior == null) return null
  const d = actual - anterior
  if (d === 0) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>= igual</span>
  return <span className="text-xs font-medium" style={{ color: d > 0 ? 'var(--success)' : 'var(--danger)' }}>{d > 0 ? '▲ +' : '▼ '}{n0(d)}</span>
}

export default function IGProfileMetrics() {
  const { hasAnyRole } = useAuth()
  const puedeActualizar = hasAnyRole(['admin', 'manager', 'ig_manager', 'ig_assistant'])
  const [cuentas, setCuentas] = useState([])
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [reels, setReels] = useState(true)
  const [busy, setBusy] = useState(null) // 'todas' | id de cuenta | null
  const [resumen, setResumen] = useState(null) // resultado de la última actualización
  const [abierta, setAbierta] = useState(null)
  const [grafica, setGrafica] = useState('followers')
  const verificadas = useVerificadasIG()
  const puedeAjustar = hasAnyRole(['admin', 'manager', 'ig_manager'])
  const [ajustes, setAjustes] = useState({ tope: null, aviso: null, falta: false, faltaAuto: false, auto: { activo: false, cadaDias: 7, hora: 8, reels: 'novedad', ultima: null, resultado: null } })
  const [fAuto, setFAuto] = useState({ activo: false, cadaDias: 7, hora: 8, reels: 'novedad' })
  const [gastoMes, setGastoMes] = useState(0)
  const [editTope, setEditTope] = useState(false)
  const [fTope, setFTope] = useState('')
  const [fAviso, setFAviso] = useState('')
  const [msgTope, setMsgTope] = useState('')
  async function cargarTope() { const [a, g] = await Promise.all([ajustesCreditosIG(), gastoMesIG()]); setAjustes(a); setGastoMes(g) }
  useEffect(() => { cargarTope() }, [])
  async function guardarTope() {
    const num = (v) => (String(v).trim() === '' ? null : Math.max(0, Math.round(Number(v))))
    const t = num(fTope), a = num(fAviso)
    if ((t !== null && Number.isNaN(t)) || (a !== null && Number.isNaN(a))) { setMsgTope('Escribe solo números.'); return }
    try { await guardarAjustesCreditosIG({ tope: t, aviso: a, auto: ajustes.faltaAuto ? undefined : { ...fAuto, cadaDias: Number(fAuto.cadaDias), hora: Number(fAuto.hora) } }); setMsgTope('✓ Guardado'); setEditTope(false); await cargarTope() } catch (e) { setMsgTope(e.message) }
  }
  const [creditos, setCreditos] = useState(null) // { n, hora }: saldo actual de ScrapeCreators
  const [errCred, setErrCred] = useState('')
  const [cargandoCred, setCargandoCred] = useState(false)
  const ultimaConsulta = useRef(0)
  async function refrescarCreditos() {
    setCargandoCred(true); setErrCred('')
    try {
      const r = await consultarCreditosIG()
      setCreditos({ n: r.creditos, hora: new Date() }); ultimaConsulta.current = Date.now()
    } catch (e) { setErrCred(e.message) }
    setCargandoCred(false)
  }
  // Al abrir la pestaña y al volver a ella (como mucho una vez por minuto) se consulta el saldo real
  useEffect(() => {
    refrescarCreditos()
    const alVolver = () => { if (document.visibilityState === 'visible' && Date.now() - ultimaConsulta.current > 60000) refrescarCreditos() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])
  const [vista, setVista] = useState('cuentas') // cuentas | alertas | ranking | publicacion | comparativa
  const [analizando, setAnalizando] = useState(null) // id de la cuenta que se está analizando a fondo

  async function cargar() {
    setLoading(true)
    const [{ data: acc }, { data: st, error: e }] = await Promise.all([
      supabase.from('instagram_accounts').select('*, models(stage_name)').eq('archivada', false).order('username'),
      supabase.from('ig_profile_stats').select('id, account_id, captured_at, followers, following, posts_count, avg_likes, avg_comments, engagement_rate, avg_reel_views, reels_sampled, posts_sampled, last_post_at, is_verified, is_private, biography, external_url, full_name, profile_pic_url').order('captured_at', { ascending: false }).limit(3000),
    ])
    if (e) setErr(e.message.includes('ig_profile_stats') ? 'Falta ejecutar la migración 61 en Supabase.' : e.message)
    else setErr('')
    setCuentas((acc || []).filter((c) => !SIN_METRICAS.includes(estadoDeCuenta(c))))
    setStats(st || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const porCuenta = useMemo(() => {
    const m = new Map()
    stats.forEach((s) => { if (!m.has(s.account_id)) m.set(s.account_id, []); m.get(s.account_id).push(s) }) // ya vienen de más nuevo a más viejo
    return m
  }, [stats])

  const filas = useMemo(() => cuentas.map((c) => {
    const h = porCuenta.get(c.id) || []
    const ult = h[0] || null
    // comparación: la última foto con al menos 6 días de antigüedad; si no hay, la anterior
    const hace7 = ult ? h.find((s) => new Date(ult.captured_at) - new Date(s.captured_at) >= 6 * 86400000) : null
    const ref = hace7 || h[1] || null
    const foto = (h.find((s) => s.profile_pic_url) || {}).profile_pic_url || null // la última foto de perfil leída
    return { ...c, modelo: c.models?.stage_name || null, historial: h, ult, ref, foto }
  }), [cuentas, porCuenta])

  const nAlertas = useMemo(() => computeAlertas(filas).filter((a) => a.severidad !== 'info').length, [filas])
  const totalSeg = filas.reduce((a, f) => a + (f.ult?.followers || 0), 0)
  const conDatos = filas.filter((f) => f.ult).length
  const ultimaAct = stats[0]?.captured_at
  const activas = cuentas.filter((c) => ['calentando', 'activa', 'en_revision'].includes(c.status))
  const creditosEst = (n) => n * (reels ? 2 : 1)

  async function actualizar(ids, etiqueta) {
    const n = ids.length || activas.length
    if (ajustes.tope != null && gastoMes + creditosEst(n) > ajustes.tope) { setErr(`Tope mensual alcanzado: llevas ${gastoMes} de ${ajustes.tope} créditos este mes y esta lectura gastaría unos ${creditosEst(n)}. Sube el tope en «Tope mensual de créditos» si quieres seguir.`); return }
    if (!window.confirm(`Se leerán ${n} ${n === 1 ? 'perfil' : 'perfiles'} de Instagram con ScrapeCreators.\n\nConsumo aproximado: ${creditosEst(n)} créditos${reels ? ' (1 por el perfil + 1 por los reels)' : ''}.\n\n¿Continuar?`)) return
    setBusy(etiqueta); setErr(''); setResumen(null)
    try {
      const r = await actualizarMetricasIG(ids, { reels, estimado: creditosEst(n) })
      setResumen(r)
      cargarTope()
      if (r.creditos_restantes != null) { setCreditos({ n: Number(r.creditos_restantes), hora: new Date() }); ultimaConsulta.current = Date.now(); setErrCred('') }
      await cargar()
      refrescarVerificadas()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  const fallos = (resumen?.resultados || []).filter((r) => !r.ok)
  const ok = (resumen?.resultados || []).filter((r) => r.ok)

  const abiertaFila = filas.find((f) => f.id === abierta)
  const datosGrafica = abiertaFila ? [...abiertaFila.historial].reverse().map((s) => ({ fecha: fFecha(s.captured_at), v: s[grafica] === null ? null : Number(s[grafica]) })) : []

  const cuentaAnalizada = analizando ? cuentas.find((c) => c.id === analizando) : null
  if (cuentaAnalizada) return <IGAccountAnalytics cuenta={cuentaAnalizada} puedeActualizar={puedeActualizar} onVolver={() => { setAnalizando(null); cargar() }} />

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[['Seguidores totales', n0(totalSeg)], ['Cuentas con datos', `${conDatos} / ${cuentas.length}`], ['Última lectura', ultimaAct ? fFechaHora(ultimaAct) : '—']].map(([t, v]) => (
          <Panel key={t} className="p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t}</p>
            <p className="font-display text-lg font-semibold tabular-nums break-words">{v}</p>
          </Panel>
        ))}
        <Panel className="p-4" data-creditos>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Créditos ScrapeCreators</p>
            <button type="button" className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={refrescarCreditos} disabled={cargandoCred} data-refrescar-creditos title="Consultar el saldo ahora">{cargandoCred ? '…' : '↻ Actualizar'}</button>
          </div>
          <p className="font-display text-lg font-semibold tabular-nums" data-creditos-valor>{creditos ? n0(creditos.n) : cargandoCred ? 'Consultando…' : '—'}</p>
          {creditos && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Saldo a las {creditos.hora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>}
          {errCred && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }} data-creditos-error>{errCred}</p>}
        </Panel>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto" data-pestanas-ig>
        {[['cuentas', 'Cuentas'], ['alertas', 'Alertas' + (nAlertas ? ` (${nAlertas})` : '')], ['ranking', 'Ranking de reels'], ['publicacion', 'Publicación'], ['comparativa', 'Comparativa']].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setVista(k)} data-vista={k} className="text-sm px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ border: '1px solid var(--border)', background: vista === k ? 'var(--accent)' : 'var(--panel)', color: vista === k ? '#fff' : 'var(--text)' }}>{t}</button>
        ))}
      </div>
      {vista === 'alertas' && <PanelAlertas filas={filas} />}
      {vista === 'ranking' && <PanelRanking filas={filas} />}
      {vista === 'publicacion' && <PanelPublicacion filas={filas} />}
      {vista === 'comparativa' && <PanelComparativa filas={filas} />}
      {vista === 'cuentas' && (<>

      <Panel className="p-4 mb-5" data-tope-creditos>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium">Créditos y lectura automática</p>
          {puedeAjustar && !editTope && <button type="button" className="text-xs underline" style={{ color: 'var(--accent)' }} data-editar-tope onClick={() => { setFTope(ajustes.tope ?? ''); setFAviso(ajustes.aviso ?? ''); setFAuto({ activo: ajustes.auto.activo, cadaDias: ajustes.auto.cadaDias, hora: ajustes.auto.hora, reels: ajustes.auto.reels }); setMsgTope(''); setEditTope(true) }}>⚙ Configurar</button>}
        </div>
        {ajustes.falta ? <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Falta ejecutar la migración 145 en Supabase para activar el tope.</p> : (
          <>
            <p className="text-sm mt-1" data-gasto-mes>Este mes has gastado <strong>{n0(gastoMes)}</strong> créditos desde el CRM{ajustes.tope != null ? <> de un tope de <strong>{n0(ajustes.tope)}</strong> (te quedan {n0(Math.max(0, ajustes.tope - gastoMes))})</> : ' · sin tope fijado'}.</p>
            {ajustes.tope != null && ajustes.tope > 0 && (
              <div className="rounded-full overflow-hidden mt-2" style={{ height: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <div data-barra-tope style={{ height: '100%', width: Math.min(100, Math.round((gastoMes / ajustes.tope) * 100)) + '%', background: gastoMes >= ajustes.tope ? 'var(--danger)' : gastoMes >= ajustes.tope * 0.8 ? 'var(--gold)' : 'var(--success)' }} />
              </div>
            )}
            {ajustes.aviso != null && creditos && creditos.n < ajustes.aviso && <p className="text-sm mt-2" data-aviso-saldo style={{ color: 'var(--danger)' }}>⚠️ Saldo bajo: te quedan {n0(creditos.n)} créditos en ScrapeCreators (aviso configurado en {n0(ajustes.aviso)}).</p>}
            {ajustes.tope != null && gastoMes >= ajustes.tope && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>Has llegado al tope: las actualizaciones quedan bloqueadas hasta el mes que viene o hasta que lo subas.</p>}
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }} data-resumen-auto>
              {ajustes.faltaAuto ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lectura automática: para activarla ejecuta la migración 146 y despliega la función «ig-auto» (ver instrucciones del lote 224).</p>
              ) : ajustes.auto.activo ? (
                <p className="text-sm" data-auto-estado>🔄 <strong>Lectura automática activada</strong>: cada {ajustes.auto.cadaDias} {ajustes.auto.cadaDias === 1 ? 'día' : 'días'}, a partir de las {String(ajustes.auto.hora).padStart(2, '0')}:00 · {MODOS_REELS[ajustes.auto.reels]?.corto}</p>
              ) : <p className="text-sm" data-auto-estado style={{ color: 'var(--text-muted)' }}>🔄 Lectura automática desactivada: todo se actualiza a mano con «Actualizar».</p>}
              {!ajustes.faltaAuto && ajustes.auto.ultima && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }} data-auto-ultima>Última ejecución: {fFechaHora(ajustes.auto.ultima)} · {ajustes.auto.resultado}</p>}
            </div>
          </>
        )}
        {editTope && (
          <div className="mt-3 flex items-end gap-3 flex-wrap">
            <label className="text-xs">Tope al mes (créditos)<input type="number" min="0" value={fTope} onChange={(e) => setFTope(e.target.value)} placeholder="sin tope" data-input-tope className="block mt-1 rounded-lg px-3 py-2 text-sm w-40" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
            <label className="text-xs">Avisar si el saldo baja de<input type="number" min="0" value={fAviso} onChange={(e) => setFAviso(e.target.value)} placeholder="sin aviso" data-input-aviso className="block mt-1 rounded-lg px-3 py-2 text-sm w-40" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
            {!ajustes.faltaAuto && (
              <div className="w-full mt-2 pt-3" style={{ borderTop: '1px solid var(--border)' }} data-editor-auto>
                <label className="text-sm flex items-center gap-2 mb-3"><input type="checkbox" checked={fAuto.activo} onChange={(e) => setFAuto({ ...fAuto, activo: e.target.checked })} data-auto-activo /> <strong>Activar la lectura automática</strong> (el tope mensual y el aviso de saldo se respetan siempre)</label>
                <div className="flex gap-3 flex-wrap items-end">
                  <label className="text-xs">Cada cuántos días
                    <select value={fAuto.cadaDias} onChange={(e) => setFAuto({ ...fAuto, cadaDias: Number(e.target.value) })} data-auto-cada className="block mt-1 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => <option key={d} value={d}>{d === 1 ? 'Todos los días' : `Cada ${d} días`}</option>)}
                    </select>
                  </label>
                  <label className="text-xs">A partir de las (hora de España)
                    <select value={fAuto.hora} onChange={(e) => setFAuto({ ...fAuto, hora: Number(e.target.value) })} data-auto-hora className="block mt-1 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                  </label>
                  <label className="text-xs">Qué datos actualizar
                    <select value={fAuto.reels} onChange={(e) => setFAuto({ ...fAuto, reels: e.target.value })} data-auto-reels className="block mt-1 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', maxWidth: 320 }}>
                      {Object.entries(MODOS_REELS).map(([k, m]) => <option key={k} value={k}>{m.largo}</option>)}
                    </select>
                  </label>
                </div>
                {(() => {
                  const lecturas = activas.length * (30 / Math.max(1, Number(fAuto.cadaDias)))
                  const min = Math.round(lecturas * 1), max = Math.round(lecturas * (fAuto.reels === 'no' ? 1 : 2))
                  const tp = String(fTope).trim() === '' ? null : Number(fTope)
                  return (
                    <p className="text-xs mt-3" data-estimacion-auto style={{ color: 'var(--text-muted)' }}>
                      Con tus <strong>{activas.length}</strong> cuentas activas, gastaría {min === max || fAuto.reels === 'siempre' ? <>unos <strong>{n0(max)}</strong></> : <>entre <strong>{n0(min)}</strong> y <strong>{n0(max)}</strong></>} créditos al mes{fAuto.reels === 'novedad' ? ' (los reels solo se leen si hay publicaciones nuevas o pasan 7 días, así que suele quedarse en la parte baja)' : ''}.
                      {tp !== null && !Number.isNaN(tp) && max > tp && <span style={{ color: 'var(--danger)' }}> ⚠️ Supera tu tope mensual ({n0(tp)}): se pararía antes de leer todas las cuentas.</span>}
                    </p>
                  )
                })()}
              </div>
            )}
            <Button onClick={guardarTope} data-guardar-tope>Guardar</Button>
            <Button variant="ghost" onClick={() => setEditTope(false)}>Cancelar</Button>
          </div>
        )}
        {msgTope && <p className="text-xs mt-2" style={{ color: msgTope.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>{msgTope}</p>}
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>El gasto del mes suma las lecturas manuales y las automáticas hechas desde el CRM. Vacío = sin tope.</p>
      </Panel>

      <Panel className="p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          {puedeActualizar && <Button onClick={() => actualizar([], 'todas')} disabled={busy !== null || !activas.length}>{busy === 'todas' ? 'Leyendo perfiles…' : `🔄 Actualizar las ${activas.length} cuentas activas`}</Button>}
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={reels} onChange={(e) => setReels(e.target.checked)} /> Incluir vistas de reels (+1 crédito por cuenta)
          </label>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Lee el perfil público de cada cuenta (seguidores, publicaciones, likes y comentarios de las últimas publicaciones, vistas de reels) y guarda una foto con la fecha para ver cómo evoluciona. Las cuentas privadas o baneadas pueden dar error.</p>
        {busy && <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>⏳ Esto puede tardar entre 5 y 40 segundos por cada grupo de 3 cuentas. No cierres la página.</p>}
        {err && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{err}</p>}
        {resumen && (
          <div className="mt-3 text-sm">
            <p style={{ color: 'var(--success)' }}>✓ {ok.length} {ok.length === 1 ? 'cuenta actualizada' : 'cuentas actualizadas'}{resumen.creditos_gastados ? ` · ${resumen.creditos_gastados} créditos gastados` : ''}{resumen.creditos_restantes != null ? ` · te quedan ${n0(resumen.creditos_restantes)}` : ''}.</p>
            {fallos.map((f) => <p key={f.account_id} className="text-xs" style={{ color: 'var(--danger)' }}>✗ @{f.username}: {f.error}</p>)}
            {ok.filter((o) => o.aviso).map((o) => <p key={o.account_id} className="text-xs" style={{ color: 'var(--text-muted)' }}>@{o.username} — {o.aviso}</p>)}
          </div>
        )}
      </Panel>

      <Panel>
        {loading ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p> : (
          <ScrollSuperior>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cuenta', 'Seguidores', 'Siguiendo', 'Posts', 'Likes medios', 'Comentarios medios', 'Engagement', 'Vistas reels', 'Último post', 'Actualizado', ''].map((c, i, arr) => (
                    <th key={c || 'acc'} className={`text-left px-3 py-3 font-medium whitespace-nowrap${i === 0 ? ' col-cuenta-fija' : ''}`}
                      style={{ color: 'var(--text-muted)', ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 6, background: 'var(--panel)' } : {}), ...(i === arr.length - 1 ? { position: 'sticky', right: 0, zIndex: 6, background: 'var(--panel)', borderLeft: '1px solid var(--border)' } : {}) }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay cuentas de Instagram.</td></tr>
                ) : filas.map((f) => (
                  <tr key={f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)} className="cursor-pointer" style={{ borderBottom: '1px solid var(--border)', background: abierta === f.id ? 'var(--accent-soft)' : undefined }}>
                    <td className="px-3 py-3 whitespace-nowrap col-cuenta-fija" style={{ position: 'sticky', left: 0, zIndex: 5, background: 'var(--panel)' }}>
                      <div className="flex items-center gap-3">
                        <FotoIG url={f.foto} nombre={f.username} />
                        <div>
                          <div className="font-medium"><a href={f.profile_link || urlInstagram(f.username)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline" style={{ color: 'var(--accent)' }} title={`Abrir el perfil de @${f.username} en Instagram`} data-perfil-ig>@{f.username}</a>{(f.ult?.is_verified || esVerificadaIG(verificadas, f.username)) && <> <InsigniaVerificada size={14} /></>}{f.ult?.is_private ? ' 🔒' : ''}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.models?.stage_name || 'Sin modelo'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums"><div className="font-medium">{n0(f.ult?.followers)}</div>{f.ult && f.ref && <Delta actual={f.ult.followers} anterior={f.ref.followers} />}</td>
                    <td className="px-3 py-3 tabular-nums">{n0(f.ult?.following)}</td>
                    <td className="px-3 py-3 tabular-nums">{n0(f.ult?.posts_count)}</td>
                    <td className="px-3 py-3 tabular-nums">{n0(f.ult?.avg_likes)}</td>
                    <td className="px-3 py-3 tabular-nums">{n0(f.ult?.avg_comments)}</td>
                    <td className="px-3 py-3 tabular-nums">{f.ult?.engagement_rate == null ? '—' : n1(f.ult.engagement_rate) + '%'}</td>
                    <td className="px-3 py-3 tabular-nums">{n0(f.ult?.avg_reel_views)}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{f.ult?.last_post_at ? hace(f.ult.last_post_at) : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{f.ult ? fFechaHora(f.ult.captured_at) : 'sin datos'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()} style={{ position: 'sticky', right: 0, zIndex: 5, background: 'var(--panel)', borderLeft: '1px solid var(--border)' }}>
                      <button className="text-xs underline mr-3" style={{ color: 'var(--accent)' }} data-analizar={f.username} onClick={() => setAnalizando(f.id)}>📊 Analizar métricas</button>
                      {puedeActualizar && <button className="text-xs underline" style={{ color: 'var(--accent)' }} disabled={busy !== null} onClick={() => actualizar([f.id], f.id)}>{busy === f.id ? 'Leyendo…' : 'Actualizar'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollSuperior>
        )}
      </Panel>

      {abiertaFila && (
        <Panel className="p-5 mt-5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">@{abiertaFila.username}</p>
              {abiertaFila.ult?.full_name && <p className="text-sm">{abiertaFila.ult.full_name}</p>}
              {abiertaFila.ult?.biography && <p className="text-xs mt-1 whitespace-pre-line break-words" style={{ color: 'var(--text-muted)' }}>{abiertaFila.ult.biography}</p>}
              {abiertaFila.ult?.external_url && <a href={abiertaFila.ult.external_url} target="_blank" rel="noreferrer" className="text-xs underline break-all" style={{ color: 'var(--accent)' }}>{abiertaFila.ult.external_url}</a>}
            </div>
            <div className="min-w-[200px]"><Select value={grafica} onChange={(e) => setGrafica(e.target.value)}>{GRAFICAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
          </div>
          {datosGrafica.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={datosGrafica}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="v" name={GRAFICAS.find((g) => g[0] === grafica)?.[1]} stroke="var(--accent)" strokeWidth={2} dot connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Necesitas al menos dos lecturas para ver la evolución. Actualiza de nuevo en unos días.</p>}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Fecha', 'Seguidores', 'Siguiendo', 'Posts', 'Likes', 'Coment.', 'Engag.', 'Vistas reels'].map((c) => <th key={c} className="text-left px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}</tr></thead>
              <tbody>
                {abiertaFila.historial.slice(0, 15).map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-2 py-2 whitespace-nowrap">{fFechaHora(s.captured_at)}</td>
                    <td className="px-2 py-2 tabular-nums">{n0(s.followers)}</td><td className="px-2 py-2 tabular-nums">{n0(s.following)}</td><td className="px-2 py-2 tabular-nums">{n0(s.posts_count)}</td>
                    <td className="px-2 py-2 tabular-nums">{n0(s.avg_likes)}</td><td className="px-2 py-2 tabular-nums">{n0(s.avg_comments)}</td>
                    <td className="px-2 py-2 tabular-nums">{s.engagement_rate == null ? '—' : n1(s.engagement_rate) + '%'}</td><td className="px-2 py-2 tabular-nums">{n0(s.avg_reel_views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      </>)}
    </div>
  )
}
