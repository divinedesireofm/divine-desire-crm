import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { actualizarMetricasIG } from '../lib/igScrape'
import { Panel, Button, Select } from '../components/ui'
import ModelName from '../components/ModelAvatar'

const n0 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const n1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const fFecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const fFechaHora = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const hace = (d) => { if (!d) return '—'; const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} d` }

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

  async function cargar() {
    setLoading(true)
    const [{ data: acc }, { data: st, error: e }] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username, status, profile_link, models(stage_name)').order('username'),
      supabase.from('ig_profile_stats').select('id, account_id, captured_at, followers, following, posts_count, avg_likes, avg_comments, engagement_rate, avg_reel_views, reels_sampled, posts_sampled, last_post_at, is_verified, is_private, biography, external_url, full_name').order('captured_at', { ascending: false }).limit(3000),
    ])
    if (e) setErr(e.message.includes('ig_profile_stats') ? 'Falta ejecutar la migración 61 en Supabase.' : e.message)
    else setErr('')
    setCuentas(acc || [])
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
    return { ...c, historial: h, ult, ref }
  }), [cuentas, porCuenta])

  const totalSeg = filas.reduce((a, f) => a + (f.ult?.followers || 0), 0)
  const conDatos = filas.filter((f) => f.ult).length
  const ultimaAct = stats[0]?.captured_at
  const activas = cuentas.filter((c) => ['calentando', 'activa', 'en_revision'].includes(c.status))
  const creditosEst = (n) => n * (reels ? 2 : 1)

  async function actualizar(ids, etiqueta) {
    const n = ids.length || activas.length
    if (!window.confirm(`Se leerán ${n} ${n === 1 ? 'perfil' : 'perfiles'} de Instagram con ScrapeCreators.\n\nConsumo aproximado: ${creditosEst(n)} créditos${reels ? ' (1 por el perfil + 1 por los reels)' : ''}.\n\n¿Continuar?`)) return
    setBusy(etiqueta); setErr(''); setResumen(null)
    try {
      const r = await actualizarMetricasIG(ids, { reels })
      setResumen(r)
      await cargar()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  const fallos = (resumen?.resultados || []).filter((r) => !r.ok)
  const ok = (resumen?.resultados || []).filter((r) => r.ok)

  const abiertaFila = filas.find((f) => f.id === abierta)
  const datosGrafica = abiertaFila ? [...abiertaFila.historial].reverse().map((s) => ({ fecha: fFecha(s.captured_at), v: s[grafica] === null ? null : Number(s[grafica]) })) : []

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[['Seguidores totales', n0(totalSeg)], ['Cuentas con datos', `${conDatos} / ${cuentas.length}`], ['Última lectura', ultimaAct ? fFechaHora(ultimaAct) : '—'], ['Créditos ScrapeCreators', resumen?.creditos_restantes != null ? n0(resumen.creditos_restantes) : 'tras actualizar']].map(([t, v]) => (
          <Panel key={t} className="p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t}</p>
            <p className="font-display text-lg font-semibold tabular-nums break-words">{v}</p>
          </Panel>
        ))}
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cuenta', 'Seguidores', 'Siguiendo', 'Posts', 'Likes medios', 'Comentarios medios', 'Engagement', 'Vistas reels', 'Último post', 'Actualizado', ''].map((c) => (
                    <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Todavía no hay cuentas de Instagram.</td></tr>
                ) : filas.map((f) => (
                  <tr key={f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)} className="cursor-pointer" style={{ borderBottom: '1px solid var(--border)', background: abierta === f.id ? 'var(--accent-soft)' : undefined }}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium">@{f.username}{f.ult?.is_verified ? ' ✔' : ''}{f.ult?.is_private ? ' 🔒' : ''}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}><ModelName name={f.models?.stage_name} /></div>
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
                    <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {puedeActualizar && <button className="text-xs underline" style={{ color: 'var(--accent)' }} disabled={busy !== null} onClick={() => actualizar([f.id], f.id)}>{busy === f.id ? 'Leyendo…' : 'Actualizar'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  )
}
