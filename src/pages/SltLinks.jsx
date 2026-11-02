import { Fragment, useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { actualizarEnlacesSLT } from '../lib/slt'
import { Panel, Button, Select, PageHeader } from '../components/ui'
import ScrollSuperior from '../components/ScrollSuperior'

const n0 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const pct = (a, b) => (b > 0 ? (a / b * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%' : '—')
const fCorta = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '')
const hoyISO = () => new Date().toISOString().slice(0, 10)
const sumarDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const hace = (d) => { if (!d) return 'nunca'; const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.floor(min / 60)} h` : `hace ${Math.floor(min / 1440)} d` }
const RANGOS = [['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['60', 'Últimos 60 días']]
const desdeDe = (r) => (r === 'hoy' ? hoyISO() : sumarDias(hoyISO(), -(Number(r) - 1)))

export default function SltLinks() {
  const { hasAnyRole } = useAuth()
  const puedeAsignar = hasAnyRole(['admin', 'ig_manager'])
  const [cuentas, setCuentas] = useState([])
  const [paginas, setPaginas] = useState([])
  const [enlaces, setEnlaces] = useState([])
  const [diarios, setDiarios] = useState([])
  const [porLink, setPorLink] = useState([])
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [rango, setRango] = useState('7')
  const [abierta, setAbierta] = useState(null)
  const [filtro, setFiltro] = useState('todas') // todas | sin_asignar

  async function cargar() {
    const [acc, pg, lk, pd, ld, st] = await Promise.all([
      supabase.from('instagram_accounts').select('id, username, models(stage_name)').order('username'),
      supabase.from('slt_pages').select('*').order('slug'),
      supabase.from('slt_links').select('*'),
      supabase.from('slt_page_daily').select('*').gte('day', sumarDias(hoyISO(), -61)).limit(20000),
      supabase.from('slt_link_daily').select('*').gte('day', sumarDias(hoyISO(), -61)).limit(20000),
      supabase.from('slt_estado').select('ultima_sync, resumen').eq('id', 1).maybeSingle(),
    ])
    const fallo = [pg, lk, pd, ld, st].find((r) => r.error)
    if (fallo) setErr(/slt_/.test(fallo.error.message) ? 'Falta ejecutar la migración 84 en Supabase.' : fallo.error.message)
    else setErr('')
    setCuentas(acc.data || []); setPaginas(pg.data || []); setEnlaces(lk.data || [])
    setDiarios(pd.data || []); setPorLink(ld.data || []); setEstado(st.data || null)
    setLoading(false)
    return st.data || null
  }

  async function actualizar(forzar, silencioso = false) {
    setBusy(true); if (!silencioso) setMsg('')
    try {
      const r = await actualizarEnlacesSLT(forzar)
      await cargar()
      if (!silencioso) {
        const s = r.resumen || {}
        setMsg(r.en_cache ? 'Ya estaba al día (se actualizó hace menos de 5 minutos).'
          : `✓ Actualizado: ${s.paginas ?? 0} páginas, ${s.enlaces ?? 0} enlaces, ${s.eventos ?? 0} clicks recientes leídos.${s.sin_asignar ? ` ${s.sin_asignar} página(s) sin cuenta asignada.` : ''}${s.avisos?.length ? ' · ' + s.avisos.join(' · ') : ''}`)
      }
    } catch (e) {
      setMsg(/Failed to send|not found|404|FunctionsFetch/i.test(e.message) ? 'No se encuentra la función «slt-links» en Supabase: hay que crearla (mira el LEEME del lote).' : e.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    cargar().then((st) => {
      // al entrar, si los datos tienen más de una hora, se refrescan solos
      if (!st?.ultima_sync || Date.now() - new Date(st.ultima_sync).getTime() > 3600000) actualizar(false, true)
    })
  }, [])

  const desde = desdeDe(rango)
  const cuentaDe = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])
  const enRango = (d) => d >= desde

  const filas = useMemo(() => paginas.map((p) => {
    const dias = diarios.filter((d) => d.page_id === p.page_id && enRango(d.day))
    const vistas = dias.reduce((t, d) => t + (d.views || 0), 0)
    const clicks = dias.reduce((t, d) => t + (d.clicks || 0), 0)
    const conVis = dias.filter((d) => d.visitors !== null && d.visitors !== undefined)
    const visitantes = conVis.length ? conVis.reduce((t, d) => t + d.visitors, 0) : null
    const serie = []
    for (let d = desde; d <= hoyISO(); d = sumarDias(d, 1)) {
      const x = dias.find((y) => y.day === d); serie.push({ dia: fCorta(d), Vistas: x?.views || 0, Clicks: x?.clicks || 0 })
    }
    return { ...p, vistas, clicks, visitantes, serie }
  }).sort((a, b) => b.clicks - a.clicks || b.vistas - a.vistas), [paginas, diarios, rango])

  const visibles = filas.filter((f) => filtro === 'todas' || !f.account_id)
  const tot = useMemo(() => {
    const vistas = filas.reduce((t, f) => t + f.vistas, 0)
    const clicks = filas.reduce((t, f) => t + f.clicks, 0)
    const vis = filas.filter((f) => f.visitantes !== null)
    return { vistas, clicks, visitantes: vis.length ? vis.reduce((t, f) => t + f.visitantes, 0) : null }
  }, [filas])

  const clicksDe = (linkId) => {
    const ds = porLink.filter((d) => d.link_id === linkId && enRango(d.day))
    return { clicks: ds.reduce((t, d) => t + (d.clicks || 0), 0), humanos: ds.reduce((t, d) => t + (d.clicks_humanos || 0), 0) }
  }
  const primerDiaDetalle = useMemo(() => porLink.reduce((m, d) => (!m || d.day < m ? d.day : m), ''), [porLink])
  const poplinks = enlaces.filter((l) => l.tipo === 'poplink').map((l) => ({ ...l, ...clicksDe(l.link_id) })).sort((a, b) => b.clicks - a.clicks)

  async function asignar(tabla, id, campo, cuenta) {
    const { error } = await supabase.from(tabla).update({ account_id: cuenta || null }).eq(campo, id)
    if (error) { setMsg('No se pudo asignar: ' + error.message); return }
    await cargar()
  }
  const selCuenta = (valor, onChange) => (
    <select value={valor || ''} onChange={(e) => onChange(e.target.value)} disabled={!puedeAsignar} onClick={(e) => e.stopPropagation()}
      className="rounded px-2 py-1 text-xs max-w-[190px]" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      <option value="">— Sin asignar —</option>
      {cuentas.map((c) => <option key={c.id} value={c.id}>@{String(c.username || '').replace(/^@/, '')}{c.models?.stage_name ? ` · ${c.models.stage_name}` : ''}</option>)}
    </select>
  )
  const nombreCuenta = (id) => { const c = cuentaDe.get(id); return c ? <strong>@{String(c.username || '').replace(/^@/, '')}</strong> : <span style={{ color: 'var(--danger)' }}>Sin asignar</span> }
  const th = (t, extra = '') => <th key={t} className={`text-left px-3 py-2 font-medium whitespace-nowrap ${extra}`} style={{ color: 'var(--text-muted)' }}>{t}</th>
  const sinAsignar = filas.filter((f) => !f.account_id).length

  return (
    <div>
      <PageHeader title="Enlaces" subtitle="Vistas y clicks de los enlaces de cada cuenta, leídos de SLT."
        action={<Button onClick={() => actualizar(true)} disabled={busy}>{busy ? 'Actualizando…' : '🔄 Actualizar desde SLT'}</Button>} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {RANGOS.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setRango(k)} className="px-3 py-1.5 rounded-md text-xs"
              style={{ background: rango === k ? 'var(--accent)' : 'var(--panel-alt)', color: rango === k ? '#000' : 'var(--text)', border: '1px solid ' + (rango === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Última lectura de SLT: {hace(estado?.ultima_sync)} · fechas en hora UTC</span>
      </div>

      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: msg.startsWith('✓') || msg.startsWith('Ya estaba') ? 'var(--success)' : 'var(--danger)' }}>{msg}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[['Vistas', n0(tot.vistas)], ['Clicks', n0(tot.clicks)], ['Clicks / vistas', pct(tot.clicks, tot.vistas)], ['Visitantes', n0(tot.visitantes)]].map(([k, v]) => (
          <Panel key={k} className="p-4"><p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{k}</p><p className="text-xl font-display font-semibold gold-text tabular-nums">{v}</p></Panel>
        ))}
      </div>

      <Panel className="mb-5">
        <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Páginas de enlaces por cuenta</p>
          <div className="flex gap-2 items-center">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todas">Todas ({filas.length})</option>
              <option value="sin_asignar">Sin cuenta asignada ({sinAsignar})</option>
            </Select>
          </div>
        </div>
        {loading ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          : visibles.length === 0 ? <p className="p-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>{paginas.length ? 'No hay páginas en esta vista.' : 'Todavía no hay datos: pulsa «Actualizar desde SLT».'}</p> : (
            <ScrollSuperior>
              <table className="w-full text-sm">
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Cuenta', 'Página SLT', 'Vistas', 'Clicks', 'Clicks / vistas', 'Visitantes', ''].map((t) => th(t))}</tr></thead>
                <tbody>
                  {visibles.map((f) => (
                    <Fragment key={f.page_id}>
                      <tr style={{ borderBottom: abierta === f.page_id ? 'none' : '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setAbierta(abierta === f.page_id ? null : f.page_id)}>
                        <td className="px-3 py-2.5 whitespace-nowrap">{f.account_id ? nombreCuenta(f.account_id) : selCuenta('', (v) => asignar('slt_pages', f.page_id, 'page_id', v))}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{f.slug || f.display_name || f.page_id}<span className="text-xs block" style={{ color: 'var(--text-muted)' }}>{f.active_domain}{f.published === false ? ' · sin publicar' : ''}</span></td>
                        <td className="px-3 py-2.5 tabular-nums">{n0(f.vistas)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">{n0(f.clicks)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{pct(f.clicks, f.vistas)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{n0(f.visitantes)}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--accent)' }}>{abierta === f.page_id ? '▲ Ocultar' : '▼ Detalle'}</td>
                      </tr>
                      {abierta === f.page_id && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={7} className="px-3 pb-4 pt-1">
                            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                              Cuenta de Instagram: {selCuenta(f.account_id, (v) => asignar('slt_pages', f.page_id, 'page_id', v))}
                              {!puedeAsignar && <span>(solo admin e IG manager pueden cambiarla)</span>}
                            </div>
                            {rango !== 'hoy' && (
                              <div style={{ height: 200 }} className="mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={f.serie} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                    <XAxis dataKey="dia" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="Vistas" stroke="var(--accent)" dot={false} strokeWidth={2} />
                                    <Line type="monotone" dataKey="Clicks" stroke="var(--success)" dot={false} strokeWidth={2} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>Clicks por enlace</p>
                            {(() => {
                              const ls = enlaces.filter((l) => l.page_id === f.page_id).map((l) => ({ ...l, ...clicksDe(l.link_id) })).sort((a, b) => b.clicks - a.clicks)
                              if (!ls.length) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Esta página no tiene enlaces.</p>
                              return (
                                <table className="w-full text-sm">
                                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Enlace', 'Destino', 'Clicks', 'Clicks humanos'].map((t) => th(t))}</tr></thead>
                                  <tbody>
                                    {ls.map((l) => (
                                      <tr key={l.link_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td className="px-3 py-1.5 whitespace-nowrap">{l.label || l.platform || 'Enlace'}{l.platform && l.label ? <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>({l.platform})</span> : null}</td>
                                        <td className="px-3 py-1.5 text-xs max-w-[320px] truncate" style={{ color: 'var(--text-muted)' }} title={l.url}>{l.url}</td>
                                        <td className="px-3 py-1.5 tabular-nums font-semibold">{n0(l.clicks)}</td>
                                        <td className="px-3 py-1.5 tabular-nums">{n0(l.humanos)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )
                            })()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </ScrollSuperior>
          )}
        <p className="px-4 pb-3 pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Vistas = cada carga de la página · Visitantes = personas distintas (sin contar hoy ni el tráfico marcado como bot). SLT solo da el detalle de clicks por enlace de los últimos 7 días, así que ese dato se va acumulando cada vez que se actualiza{primerDiaDetalle ? ` (guardado desde el ${fCorta(primerDiaDetalle)})` : ''}.
        </p>
      </Panel>

      {poplinks.length > 0 && (
        <Panel className="mb-5">
          <p className="font-medium px-4 pt-4">PopLinks (enlaces cortos igpopl.ink)</p>
          <ScrollSuperior>
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Cuenta', 'PopLink', 'Destino', 'Clicks', 'Clicks humanos'].map((t) => th(t))}</tr></thead>
              <tbody>
                {poplinks.map((l) => (
                  <tr key={l.link_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">{selCuenta(l.account_id, (v) => asignar('slt_links', l.link_id, 'link_id', v))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{l.poplink_url || l.label}</td>
                    <td className="px-3 py-2 text-xs max-w-[300px] truncate" style={{ color: 'var(--text-muted)' }} title={l.url}>{l.url}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{n0(l.clicks)}</td>
                    <td className="px-3 py-2 tabular-nums">{n0(l.humanos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollSuperior>
        </Panel>
      )}
    </div>
  )
}
