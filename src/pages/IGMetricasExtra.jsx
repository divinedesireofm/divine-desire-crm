import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel } from '../components/ui'
import { computeAlertas } from '../lib/igAlertas'

const n0 = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const n1 = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const fFecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const DIA = 86400000
const selStyle = { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }
const COLOR = { alta: 'var(--danger)', media: 'var(--gold)', info: 'var(--success)' }
const ETQ = { alta: 'Urgente', media: 'Atención', info: 'Buena noticia' }

export function urlPieza(c) { return `https://www.instagram.com/${c.es_video ? 'reel' : 'p'}/${c.codigo}/` }

// Carga única del catálogo de piezas (reels y posts) de todas las cuentas
function useContenidos(activo) {
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!activo || datos) return
    let vivo = true
    supabase.rpc('ig_contenidos', { p_dias: 365 }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setErr(/ig_contenidos|function/i.test(error.message) ? 'Falta ejecutar la migración 147 en Supabase.' : error.message)
      else setDatos(data || [])
    })
    return () => { vivo = false }
  }, [activo, datos])
  return { datos, err }
}

function Vacio({ children }) { return <Panel className="p-4"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{children}</p></Panel> }

export function PanelAlertas({ filas }) {
  const alertas = useMemo(() => computeAlertas(filas), [filas])
  if (!alertas.length) return <Vacio>✅ Todo en orden: no hay alertas con los datos guardados. Se calculan comparando las lecturas guardadas de cada cuenta, así que cuantas más lecturas haya, más fiables son.</Vacio>
  return (
    <div data-alertas>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Se calculan al abrir esta pestaña comparando las lecturas guardadas (no gastan créditos). Para que sean actuales hace falta leer las cuentas con regularidad.</p>
      <div className="grid gap-2">
        {alertas.map((a) => (
          <Panel key={a.id} className="p-3" data-alerta={a.tipo}>
            <div className="flex items-start gap-3 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ border: `1px solid ${COLOR[a.severidad]}`, color: COLOR[a.severidad] }}>{ETQ[a.severidad]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">@{a.username}{a.modelo ? <span style={{ color: 'var(--text-muted)' }}> · {a.modelo}</span> : null} — {a.titulo}</p>
                <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-muted)' }}>{a.detalle}{a.fecha ? ` · ${fFecha(a.fecha)}` : ''}</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}

export function PanelRanking({ filas }) {
  const { datos, err } = useContenidos(true)
  const [dias, setDias] = useState(30)
  const [modelo, setModelo] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [tipo, setTipo] = useState('reels')
  const [orden, setOrden] = useState('vistas')
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas])
  const modelos = useMemo(() => [...new Set(filas.map((f) => f.modelo).filter(Boolean))].sort(), [filas])
  const lista = useMemo(() => {
    if (!datos) return []
    const desde = dias ? Date.now() - dias * DIA : 0
    return datos
      .filter((c) => porId.has(c.account_id))
      .filter((c) => !desde || new Date(c.fecha).getTime() >= desde)
      .filter((c) => !modelo || porId.get(c.account_id).modelo === modelo)
      .filter((c) => !cuenta || c.account_id === cuenta)
      .filter((c) => (tipo === 'reels' ? c.es_video : tipo === 'posts' ? !c.es_video : true))
      .sort((a, b) => (Number(b[orden]) || 0) - (Number(a[orden]) || 0))
      .slice(0, 25)
  }, [datos, porId, dias, modelo, cuenta, tipo, orden])
  if (err) return <Vacio>{err}</Vacio>
  if (!datos) return <Vacio>Cargando piezas…</Vacio>
  return (
    <div data-ranking>
      <Panel className="p-3 mb-3">
        <div className="flex gap-3 flex-wrap items-end">
          <label className="text-xs">Periodo<select value={dias} onChange={(e) => setDias(Number(e.target.value))} data-rk-dias className="block mt-1 rounded-lg px-3 py-2 text-sm" style={selStyle}>{[[7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [0, 'Todo lo guardado']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="text-xs">Modelo<select value={modelo} onChange={(e) => { setModelo(e.target.value); setCuenta('') }} data-rk-modelo className="block mt-1 rounded-lg px-3 py-2 text-sm" style={selStyle}><option value="">Todas</option>{modelos.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="text-xs">Cuenta<select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="block mt-1 rounded-lg px-3 py-2 text-sm" style={selStyle}><option value="">Todas</option>{filas.filter((f) => !modelo || f.modelo === modelo).map((f) => <option key={f.id} value={f.id}>@{f.username}</option>)}</select></label>
          <label className="text-xs">Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)} className="block mt-1 rounded-lg px-3 py-2 text-sm" style={selStyle}><option value="reels">Solo reels</option><option value="posts">Solo fotos/carruseles</option><option value="todo">Todo</option></select></label>
          <label className="text-xs">Ordenar por<select value={orden} onChange={(e) => setOrden(e.target.value)} className="block mt-1 rounded-lg px-3 py-2 text-sm" style={selStyle}><option value="vistas">Vistas</option><option value="likes">Likes</option><option value="comentarios">Comentarios</option></select></label>
        </div>
      </Panel>
      {!lista.length ? <Vacio>No hay piezas guardadas con esos filtros. Actualiza las cuentas con «Incluir vistas de reels» para llenar el ranking.</Vacio> : (
        <div className="grid gap-2">
          {lista.map((c, i) => {
            const f = porId.get(c.account_id)
            return (
              <Panel key={c.account_id + c.codigo} className="p-3" data-rk-fila>
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg tabular-nums w-7 text-center" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                  {c.miniatura ? <img src={c.miniatura} alt="" referrerPolicy="no-referrer" loading="lazy" className="rounded-lg object-cover flex-shrink-0" style={{ width: 48, height: 64 }} /> : <div className="rounded-lg flex-shrink-0" style={{ width: 48, height: 64, background: 'var(--panel-alt)' }} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">@{f.username}{f.modelo ? <span style={{ color: 'var(--text-muted)' }}> · {f.modelo}</span> : null}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fFecha(c.fecha)} · {c.tipo || (c.es_video ? 'reel' : 'foto')}{c.duracion ? ` · ${n0(c.duracion)} s` : ''}{c.audio === false ? ' · sin audio' : ''}</p>
                    {c.caption && <p className="text-xs mt-0.5 line-clamp-2 break-words">{c.caption}</p>}
                  </div>
                  <div className="text-right text-xs tabular-nums flex-shrink-0">
                    <p className="text-sm font-semibold">{n0(c.vistas)} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>vistas</span></p>
                    <p style={{ color: 'var(--text-muted)' }}>{n0(c.likes)} ♥ · {n0(c.comentarios)} 💬</p>
                    <a href={urlPieza(c)} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>Abrir ↗</a>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PanelPublicacion({ filas }) {
  const { datos, err } = useContenidos(true)
  const filasP = useMemo(() => {
    if (!datos) return []
    const ahora = Date.now()
    return filas.filter((f) => f.ult).map((f) => {
      const mias = datos.filter((c) => c.account_id === f.id)
      const en = (d, v) => mias.filter((c) => c.es_video === v && ahora - new Date(c.fecha).getTime() <= d * DIA).length
      const ultPieza = mias.reduce((m, c) => Math.max(m, new Date(c.fecha).getTime()), f.ult.last_post_at ? new Date(f.ult.last_post_at).getTime() : 0)
      const sinPublicar = ultPieza ? Math.floor((ahora - ultPieza) / DIA) : null
      const t30 = en(30, true) + en(30, false)
      return { f, r7: en(7, true), p7: en(7, false), r30: en(30, true), p30: en(30, false), semana: t30 / (30 / 7), sinPublicar }
    }).sort((a, b) => (b.sinPublicar ?? -1) - (a.sinPublicar ?? -1))
  }, [datos, filas])
  if (err) return <Vacio>{err}</Vacio>
  if (!datos) return <Vacio>Cargando piezas…</Vacio>
  return (
    <div data-publicacion>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Cada lectura trae unas 12 piezas recientes por cuenta, así que si una cuenta publica más de eso entre lectura y lectura, la cifra se queda corta. Lee con regularidad para que sea exacta.</p>
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Cuenta', 'Reels 7 d', 'Posts 7 d', 'Reels 30 d', 'Posts 30 d', 'Ritmo / semana', 'Días sin publicar'].map((c) => <th key={c} className="text-left px-3 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}</tr></thead>
          <tbody>
            {filasP.map(({ f, r7, p7, r30, p30, semana, sinPublicar }) => {
              const col = sinPublicar == null ? 'var(--text-muted)' : sinPublicar >= 14 ? 'var(--danger)' : sinPublicar >= 7 ? 'var(--gold)' : 'var(--success)'
              return (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }} data-pub-fila>
                  <td className="px-3 py-2 whitespace-nowrap">@{f.username}{f.modelo ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}> · {f.modelo}</span> : null}</td>
                  <td className="px-3 py-2 tabular-nums">{r7}</td><td className="px-3 py-2 tabular-nums">{p7}</td><td className="px-3 py-2 tabular-nums">{r30}</td><td className="px-3 py-2 tabular-nums">{p30}</td>
                  <td className="px-3 py-2 tabular-nums">{n1(semana)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium" style={{ color: col }}>{sinPublicar == null ? '—' : sinPublicar === 0 ? 'hoy' : `${sinPublicar} d`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function resumenGrupo(items) {
  const con = items.filter((f) => f.ult)
  const media = (arr) => { const v = arr.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const seg = con.reduce((a, f) => a + (f.ult.followers || 0), 0)
  const crec = con.reduce((a, f) => a + (f.ref && f.ult.followers != null && f.ref.followers != null ? f.ult.followers - f.ref.followers : 0), 0)
  return { n: items.length, seg, crec, pct: seg - crec > 0 ? (crec / (seg - crec)) * 100 : null, eng: media(con.map((f) => f.ult.engagement_rate)), vistas: media(con.map((f) => f.ult.avg_reel_views)), likes: media(con.map((f) => f.ult.avg_likes)) }
}

export function PanelComparativa({ filas }) {
  const [por, setPor] = useState('modelo')
  const grupos = useMemo(() => {
    if (por === 'cuenta') return filas.filter((f) => f.ult).map((f) => ({ nombre: '@' + f.username + (f.modelo ? ` · ${f.modelo}` : ''), ...resumenGrupo([f]) }))
    const m = new Map()
    filas.forEach((f) => { const k = f.modelo || 'Sin modelo'; if (!m.has(k)) m.set(k, []); m.get(k).push(f) })
    return [...m.entries()].map(([nombre, items]) => ({ nombre, ...resumenGrupo(items) })).filter((g) => g.seg > 0 || g.n > 0)
  }, [filas, por])
  const global = useMemo(() => resumenGrupo(filas), [filas])
  const vs = (v, ref) => (v == null || ref == null || ref === 0 ? null : ((v - ref) / ref) * 100)
  const Cmp = ({ v, base }) => { const p = vs(v, base); return p == null ? null : <span className="text-xs ml-1" style={{ color: p >= 0 ? 'var(--success)' : 'var(--danger)' }}>{p >= 0 ? '▲' : '▼'}{Math.abs(p).toFixed(0)}%</span> }
  return (
    <div data-comparativa>
      <div className="flex gap-2 mb-3">
        {[['modelo', 'Por modelo'], ['cuenta', 'Por cuenta']].map(([k, t]) => <button key={k} type="button" onClick={() => setPor(k)} data-comp-por={k} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', background: por === k ? 'var(--accent)' : 'var(--panel)', color: por === k ? '#fff' : 'var(--text)' }}>{t}</button>)}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Las flechas comparan cada fila con la media de todas las cuentas con datos. Crecimiento = seguidores ganados entre la última lectura y la de hace ~7 días.</p>
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['', 'Cuentas', 'Seguidores', 'Crecimiento 7 d', 'Engagement', 'Vistas medias reel', 'Likes medios'].map((c, i) => <th key={i} className="text-left px-3 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.nombre} style={{ borderBottom: '1px solid var(--border)' }} data-comp-fila>
                <td className="px-3 py-2 whitespace-nowrap font-medium">{g.nombre}</td>
                <td className="px-3 py-2 tabular-nums">{g.n}</td>
                <td className="px-3 py-2 tabular-nums">{n0(g.seg)}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: g.crec > 0 ? 'var(--success)' : g.crec < 0 ? 'var(--danger)' : undefined }}>{g.crec > 0 ? '+' : ''}{n0(g.crec)}{g.pct != null ? ` (${n1(g.pct)}%)` : ''}</td>
                <td className="px-3 py-2 tabular-nums">{g.eng == null ? '—' : n1(g.eng) + '%'}<Cmp v={g.eng} base={global.eng} /></td>
                <td className="px-3 py-2 tabular-nums">{n0(g.vistas)}<Cmp v={g.vistas} base={global.vistas} /></td>
                <td className="px-3 py-2 tabular-nums">{n0(g.likes)}<Cmp v={g.likes} base={global.likes} /></td>
              </tr>
            ))}
            <tr style={{ background: 'var(--panel-alt)' }}><td className="px-3 py-2 font-medium">Media global</td><td className="px-3 py-2 tabular-nums">{global.n}</td><td className="px-3 py-2 tabular-nums">{n0(global.seg)}</td><td className="px-3 py-2 tabular-nums">{global.crec > 0 ? '+' : ''}{n0(global.crec)}</td><td className="px-3 py-2 tabular-nums">{global.eng == null ? '—' : n1(global.eng) + '%'}</td><td className="px-3 py-2 tabular-nums">{n0(global.vistas)}</td><td className="px-3 py-2 tabular-nums">{n0(global.likes)}</td></tr>
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
