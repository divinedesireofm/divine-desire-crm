import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { actualizarMetricasIG } from '../lib/igScrape'
import { Panel, Button } from '../components/ui'
import { urlInstagram } from '../lib/instagramLink'

const PERIODOS = [[7, 'Últimos 7 días'], [14, 'Últimos 14 días'], [30, 'Últimos 30 días'], [90, 'Últimos 3 meses'], [180, 'Últimos 6 meses'], [365, 'Últimos 12 meses']]
const PESTANAS = [['graficas', 'Gráficas'], ['historial', 'Historial'], ['top', 'Top vídeos']]

const n0 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const n1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const fCorta = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
const fLarga = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
const clave = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const finDelDia = (k) => new Date(k + 'T23:59:59').getTime()

function Delta({ actual, anterior, pct = false }) {
  if (actual == null || anterior == null) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
  const d = actual - anterior
  if (d === 0) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>0</span>
  const p = anterior ? (d / anterior) * 100 : null
  return <span className="text-xs font-medium whitespace-nowrap" style={{ color: d > 0 ? 'var(--success)' : 'var(--danger)' }}>{d > 0 ? '▲ +' : '▼ '}{n0(d)}{pct && p !== null ? ` (${p > 0 ? '+' : ''}${n1(p)}%)` : ''}</span>
}

function Miniatura({ url, es_video }) {
  const [fallo, setFallo] = useState(false)
  const base = { width: 56, height: 72, borderRadius: 8, flexShrink: 0, border: '1px solid var(--border)' }
  if (url && !fallo) return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFallo(true)} style={{ ...base, objectFit: 'cover' }} />
  return <span aria-hidden="true" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 20 }}>{es_video ? '▶' : '▣'}</span>
}

function GraficaArea({ titulo, datos, nombre, color = 'var(--accent)', dataTest }) {
  return (
    <Panel className="p-4" >
      <p className="font-medium text-sm mb-3">{titulo}</p>
      {datos.length > 1 ? (
        <div data-grafica={dataTest}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={datos}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="etiqueta" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} domain={['auto', 'auto']} width={56} tickFormatter={(v) => n0(v)} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => n0(v)} />
              <Area type="monotone" dataKey="v" name={nombre} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>Aún no hay suficientes lecturas en este periodo. Pulsa «Actualizar datos» en distintos días para que se vaya llenando.</p>}
    </Panel>
  )
}

// Pantalla de análisis de una cuenta de Instagram (estilo OFM Pro) con lo que da ScrapeCreators:
// una foto del perfil cada vez que se actualiza + el detalle de las últimas publicaciones y reels.
export default function IGAccountAnalytics({ cuenta, puedeActualizar, onVolver }) {
  const [filas, setFilas] = useState([]) // lecturas, de más nueva a más vieja
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [dias, setDias] = useState(30)
  const [pestana, setPestana] = useState('graficas')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.from('ig_profile_stats').select('*').eq('account_id', cuenta.id).order('captured_at', { ascending: false }).limit(1500)
    setErr(error ? error.message : '')
    setFilas(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [cuenta.id])

  async function actualizar() {
    if (!window.confirm('Se leerá el perfil de @' + cuenta.username + ' con ScrapeCreators.\n\nConsumo aproximado: 2 créditos (1 por el perfil + 1 por los reels).\n\n¿Continuar?')) return
    setBusy(true); setErr(''); setAviso('')
    try {
      const r = await actualizarMetricasIG([cuenta.id], { reels: true })
      const fallo = (r.resultados || []).find((x) => !x.ok)
      if (fallo) setErr(fallo.error)
      else setAviso(`✓ Datos actualizados${r.creditos_gastados ? ` · ${r.creditos_gastados} créditos gastados` : ''}${r.creditos_restantes != null ? ` · quedan ${n0(r.creditos_restantes)}` : ''}`)
      await cargar()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const ult = filas[0] || null
  const primera = filas.length ? filas[filas.length - 1] : null
  const foto = (filas.find((s) => s.profile_pic_url) || {}).profile_pic_url || null

  // Catálogo de contenidos conocidos: une todas las lecturas por código (gana el dato más reciente)
  const catalogo = useMemo(() => {
    const m = new Map()
    const viejoANuevo = [...filas].reverse()
    viejoANuevo.forEach((s) => {
      const lista = [...(s.raw?.recent_posts || []), ...(s.raw?.recent_reels || [])] // los reels (con vistas fiables) pisan a los posts
      lista.forEach((p) => {
        if (!p?.codigo) return
        const prev = m.get(p.codigo) || {}
        const nuevo = { ...prev }
        Object.entries(p).forEach(([k, v]) => { if (v !== null && v !== undefined) nuevo[k] = v })
        m.set(p.codigo, nuevo)
      })
    })
    return [...m.values()].filter((c) => c.fecha)
  }, [filas])

  const desde = useMemo(() => Date.now() - dias * 86400000, [dias])
  const enPeriodo = useMemo(() => catalogo.filter((c) => new Date(c.fecha).getTime() >= desde), [catalogo, desde])
  const suma = (arr, k) => arr.reduce((a, c) => a + (Number(c[k]) || 0), 0)
  const kpis = [
    ['Visualizaciones totales', suma(enPeriodo, 'vistas')],
    ['Likes totales', suma(enPeriodo, 'likes')],
    ['Comentarios totales', suma(enPeriodo, 'comentarios')],
  ]

  // Una fila por día (la última lectura de cada día), de vieja a nueva, con el acumulado del contenido conocido hasta esa fecha
  const porDia = useMemo(() => {
    const m = new Map()
    ;[...filas].reverse().forEach((s) => m.set(clave(s.captured_at), s))
    return [...m.entries()].map(([k, s]) => {
      const hasta = finDelDia(k)
      const conocido = catalogo.filter((c) => new Date(c.fecha).getTime() <= hasta)
      return { k, s, seguidores: s.followers, siguiendo: s.following, posts: s.posts_count, vistas: suma(conocido, 'vistas'), likes: suma(conocido, 'likes'), comentarios: suma(conocido, 'comentarios'), etiqueta: fCorta(s.captured_at) }
    })
  }, [filas, catalogo])

  const dentro = porDia.filter((d) => new Date(d.s.captured_at).getTime() >= desde)
  const idxPrimero = dentro.length ? porDia.indexOf(dentro[0]) : -1
  const base = idxPrimero > 0 ? porDia[idxPrimero - 1] : dentro[0] // referencia para el cambio del periodo
  const ultimoDia = dentro[dentro.length - 1] || null
  const cambioSeg = ultimoDia && base ? ultimoDia.seguidores - base.seguidores : null
  const cambioPct = cambioSeg !== null && base?.seguidores ? (cambioSeg / base.seguidores) * 100 : null
  const historial = [...dentro].reverse() // de más nuevo a más viejo para la tabla

  const top = useMemo(() => enPeriodo.filter((c) => c.es_video).sort((a, b) => (b.vistas || 0) - (a.vistas || 0)).slice(0, 10), [enPeriodo])

  function exportar() {
    const cab = ['Fecha', 'Seguidores', 'Siguiendo', 'Publicaciones', 'Vistas (acumulado)', 'Likes (acumulado)', 'Comentarios (acumulado)']
    const lineas = historial.map((d) => [clave(d.s.captured_at), d.seguidores ?? '', d.siguiendo ?? '', d.posts ?? '', d.vistas, d.likes, d.comentarios].join(';'))
    const blob = new Blob(['﻿' + [cab.join(';'), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `metricas-${cuenta.username}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const enlace = cuenta.profile_link || urlInstagram(cuenta.username)
  const periodoTxt = (PERIODOS.find((p) => p[0] === dias) || [])[1]

  return (
    <div data-analisis-cuenta={cuenta.id}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <button type="button" className="text-sm underline" style={{ color: 'var(--accent)' }} onClick={onVolver} data-volver-metricas>← Volver a métricas de perfil</button>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} data-periodo className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {PERIODOS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
          <Button variant="ghost" onClick={exportar} disabled={!historial.length} data-exportar>⬇ Exportar CSV</Button>
          {puedeActualizar && <Button onClick={actualizar} disabled={busy} data-actualizar-analisis>{busy ? 'Leyendo…' : '🔄 Actualizar datos'}</Button>}
        </div>
      </div>
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      {aviso && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{aviso}</p>}

      <Panel className="p-5 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          {foto ? <img src={foto} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} /> : <span style={{ width: 64, height: 64, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, fontSize: 24 }}>{(cuenta.username || '?').charAt(0).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold"><a href={enlace} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>@{cuenta.username}</a>{ult?.is_verified ? ' ✔' : ''}</p>
            {ult?.full_name && <p className="text-sm">{ult.full_name}</p>}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{cuenta.models?.stage_name || 'Sin modelo'}{primera ? ` · Seguimiento desde ${fLarga(primera.captured_at)}` : ''}{ult ? ` · Última lectura ${fLarga(ult.captured_at)}` : ''}</p>
            {ult?.biography && <p className="text-xs mt-1 whitespace-pre-line break-words" style={{ color: 'var(--text-muted)' }}>{ult.biography}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[['Seguidores', ult?.followers], ['Siguiendo', ult?.following], ['Publicaciones', ult?.posts_count]].map(([t, v]) => (
              <div key={t}><p className="font-display text-xl font-semibold tabular-nums">{n0(v)}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t}</p></div>
            ))}
          </div>
        </div>
        {ult && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>Engagement {ult.engagement_rate == null ? '—' : n1(ult.engagement_rate) + '%'} · Likes medios {n0(ult.avg_likes)} · Comentarios medios {n0(ult.avg_comments)} · Vistas medias de reels {n0(ult.avg_reel_views)}</p>}
      </Panel>

      {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p> : !filas.length ? (
        <Panel className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Esta cuenta todavía no tiene ninguna lectura. {puedeActualizar ? 'Pulsa «Actualizar datos» para hacer la primera.' : 'Pide a un manager que la actualice.'}</Panel>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {PESTANAS.map(([id, l]) => (
              <button key={id} type="button" data-pestana={id} onClick={() => setPestana(id)} className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: pestana === id ? 'var(--accent)' : 'var(--panel)', color: pestana === id ? '#0B1020' : 'var(--text)', border: '1px solid var(--border)' }}>{l}</button>
            ))}
          </div>

          {pestana === 'graficas' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-kpis>
                {kpis.map(([t, v]) => (
                  <Panel key={t} className="p-4">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t}</p>
                    <p className="font-display text-2xl font-semibold tabular-nums">{n0(v)}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{enPeriodo.length} {enPeriodo.length === 1 ? 'contenido publicado' : 'contenidos publicados'} · {periodoTxt?.toLowerCase()}</p>
                  </Panel>
                ))}
              </div>
              <Panel className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <p className="font-medium text-sm">Crecimiento de seguidores</p>
                  <p className="text-sm" data-cambio-seguidores>
                    {cambioSeg === null ? '—' : <span style={{ color: cambioSeg >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{cambioSeg > 0 ? '+' : ''}{n0(cambioSeg)}{cambioPct !== null ? ` (${cambioPct > 0 ? '+' : ''}${n1(cambioPct)}%)` : ''}</span>} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>en el periodo</span>
                  </p>
                </div>
                {dentro.length > 1 ? (
                  <div data-grafica="seguidores">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={dentro.map((d) => ({ etiqueta: d.etiqueta, v: d.seguidores }))}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="etiqueta" stroke="var(--text-muted)" fontSize={12} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} domain={['auto', 'auto']} width={56} tickFormatter={(v) => n0(v)} />
                        <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => n0(v)} />
                        <Area type="monotone" dataKey="v" name="Seguidores" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>Hace falta más de una lectura en este periodo para dibujar la curva. Actualiza en días distintos y se irá llenando.</p>}
              </Panel>
              <GraficaArea titulo="Visualizaciones en el tiempo (acumulado del contenido conocido)" datos={dentro.map((d) => ({ etiqueta: d.etiqueta, v: d.vistas }))} nombre="Visualizaciones" dataTest="vistas" />
              <GraficaArea titulo="Likes en el tiempo (acumulado)" datos={dentro.map((d) => ({ etiqueta: d.etiqueta, v: d.likes }))} nombre="Likes" color="var(--success)" dataTest="likes" />
              <GraficaArea titulo="Comentarios en el tiempo (acumulado)" datos={dentro.map((d) => ({ etiqueta: d.etiqueta, v: d.comentarios }))} nombre="Comentarios" color="var(--warning, #d97706)" dataTest="comentarios" />
            </div>
          )}

          {pestana === 'historial' && (
            <Panel>
              <p className="text-sm font-medium px-4 pt-4">Historial reciente</p>
              <div className="overflow-x-auto p-2">
                <table className="w-full text-sm" data-tabla-historial>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Fecha', 'Seguidores', 'Siguiendo', 'Vistas', 'Likes', 'Comentarios', 'Publicaciones'].map((c) => <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}</tr></thead>
                  <tbody>
                    {historial.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>No hay lecturas en este periodo.</td></tr> : historial.map((d) => {
                      const i = porDia.indexOf(d); const prev = i > 0 ? porDia[i - 1] : null
                      return (
                        <tr key={d.k} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 whitespace-nowrap">{fLarga(d.s.captured_at)}</td>
                          {[['seguidores', true], ['siguiendo', false], ['vistas', true], ['likes', true], ['comentarios', true], ['posts', false]].map(([k, pct]) => (
                            <td key={k} className="px-3 py-2 tabular-nums"><div className="font-medium">{n0(d[k])}</div>{prev && <Delta actual={d[k]} anterior={prev[k]} pct={pct} />}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs px-4 pb-4" style={{ color: 'var(--text-muted)' }}>Una fila por día (la última lectura de ese día). Vistas, likes y comentarios son la suma del contenido que conocemos publicado hasta esa fecha.</p>
            </Panel>
          )}

          {pestana === 'top' && (
            <Panel className="p-4">
              <p className="text-sm font-medium mb-3">Vídeos con más visualizaciones · {periodoTxt?.toLowerCase()}</p>
              {top.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No hay vídeos publicados en este periodo entre los últimos contenidos que devuelve la API. Prueba con un periodo más largo.</p> : (
                <div className="space-y-3" data-top-videos>
                  {top.map((c, i) => (
                    <div key={c.codigo} className="flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                      <span className="text-sm font-semibold w-6 text-center" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      <Miniatura url={c.miniatura} es_video />
                      <div className="min-w-0 flex-1">
                        <a href={`https://www.instagram.com/reel/${c.codigo}/`} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: 'var(--accent)' }}>Ver en Instagram</a>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fLarga(c.fecha)}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center text-sm tabular-nums">
                        <div><p className="font-semibold">{n0(c.vistas)}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Vistas</p></div>
                        <div><p className="font-semibold">{n0(c.likes)}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Likes</p></div>
                        <div><p className="font-semibold">{n0(c.comentarios)}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Coment.</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>ℹ️ Fuente: ScrapeCreators (datos públicos). La API devuelve solo las últimas ~12 publicaciones y reels, y no da histórico de seguidores ni datos de audiencia: la evolución se construye con cada lectura que haces, así que cuantas más veces actualices, más completa queda.</p>
        </>
      )}
    </div>
  )
}
