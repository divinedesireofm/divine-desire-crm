import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportCSV } from '../lib/csv'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { TURNOS_FAN, traerComprasFans, aplanar, rankingFans } from '../lib/topFans'
import { claveFan } from '../lib/fanFicha'
import FichaFan from '../components/FichaFan'

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const hoy = () => iso(new Date())
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); return iso(d) }
const fmtF = (s) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const money = (n) => '$' + Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const lbl = { color: 'var(--text-muted)' }
const PRESETS = [{ id: -1, n: 'Todo el tiempo' }, { id: 7, n: 'Últimos 7 días' }, { id: 30, n: 'Últimos 30 días' }, { id: 90, n: 'Últimos 90 días' }, { id: 365, n: 'Último año' }, { id: 0, n: 'Personalizado' }]

export default function TopFans() {
  const [compras, setCompras] = useState([])
  const [sinMonto, setSinMonto] = useState(0)
  const [modelos, setModelos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [preset, setPreset] = useState(-1)
  const [desde, setDesde] = useState(hace(30))
  const [hasta, setHasta] = useState(hoy())
  const [fChatter, setFChatter] = useState('todos')
  const [fTurno, setFTurno] = useState('todos')
  const [fModelo, setFModelo] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [vista, setVista] = useState('general')
  const [limite, setLimite] = useState(50)
  const [fichas, setFichas] = useState({})      // { fan_key: { etiquetas, nombre } }
  const [nombres, setNombres] = useState({})    // id de persona → nombre (autores de las notas)
  const [fEtiqueta, setFEtiqueta] = useState('todas')
  const [abierto, setAbierto] = useState(null)  // fan con la ficha abierta

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [{ filas, error }, { data: ms }, { data: fs }, { data: ps }] = await Promise.all([traerComprasFans(), supabase.from('models').select('id, stage_name').order('stage_name'), supabase.from('fan_fichas').select('fan_key, etiquetas, nombre'), supabase.from('profiles').select('id, full_name')])
      if (!vivo) return
      setFichas(Object.fromEntries((fs || []).map((x) => [x.fan_key, x]))); setNombres(Object.fromEntries((ps || []).map((x) => [x.id, x.full_name])))
      if (error) setErr('No se pudieron leer todas las compras: ' + error)
      const a = aplanar(filas)
      setCompras(a.compras); setSinMonto(a.sinMonto); setModelos(ms || []); setCargando(false)
    })()
    return () => { vivo = false }
  }, [])

  const chatters = useMemo(() => {
    const m = new Map(); compras.forEach((c) => { if (c.chatterId) m.set(c.chatterId, c.chatter) })
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [compras])

  function cambiarPreset(v) {
    const n = Number(v); setPreset(n)
    if (n > 0) { setDesde(hace(n)); setHasta(hoy()) }
  }
  const rango = preset === -1 ? {} : { desde, hasta }
  const base = { chatter: fChatter, modelo: fModelo, buscar, ...rango }
  const conEtiqueta = (lista) => (fEtiqueta === 'todas' ? lista : lista.filter((r) => (fichas[claveFan(r.user)]?.etiquetas || []).includes(fEtiqueta)))
  const ranking = useMemo(() => conEtiqueta(rankingFans(compras, { ...base, turno: fTurno })), [compras, fChatter, fModelo, buscar, fTurno, preset, desde, hasta, fEtiqueta, fichas]) // eslint-disable-line
  const porTurno = useMemo(() => TURNOS_FAN.map((t) => ({ ...t, lista: conEtiqueta(rankingFans(compras, { ...base, turno: t.id })) })), [compras, fChatter, fModelo, buscar, preset, desde, hasta, fEtiqueta, fichas]) // eslint-disable-line
  const todasEtiquetas = useMemo(() => Array.from(new Set(Object.values(fichas).flatMap((x) => x.etiquetas || []))).sort((a, b) => a.localeCompare(b, 'es')), [fichas])
  const comprasDe = (u) => compras.filter((c) => c.user.toLowerCase().replace(/^@+/, '') === claveFan(u)).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  const fanAbierto = abierto ? (rankingFans(compras, {}).find((r) => claveFan(r.user) === claveFan(abierto)) || { user: abierto, nombre: '', total: 0, n: 0, ultima: '' }) : null
  const chips = (u) => (fichas[claveFan(u)]?.etiquetas || []).map((t) => <span key={t} className="ml-1 px-2 py-0.5 rounded-full text-xs" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{t}</span>)
  const total = ranking.reduce((a, r) => a + r.total, 0)

  function exportar() {
    exportCSV('top_fans', ranking, [
      { label: '#', get: (r) => ranking.indexOf(r) + 1 }, { label: 'Usuario', get: (r) => r.user }, { label: 'Nombre', get: (r) => r.nombre },
      { label: 'Gasto total', get: (r) => r.total.toFixed(2) }, { label: 'PPV', get: (r) => r.ppv.toFixed(2) }, { label: 'Tips', get: (r) => r.tips.toFixed(2) },
      { label: 'Compras', get: (r) => r.n }, { label: 'Mañana', get: (r) => r.porTurno.mañana.toFixed(2) }, { label: 'Tarde', get: (r) => r.porTurno.tarde.toFixed(2) }, { label: 'Noche', get: (r) => r.porTurno.noche.toFixed(2) },
      { label: 'Última compra', get: (r) => fmtF(r.ultima) }, { label: 'Modelos', get: (r) => Array.from(r.modelos).join(', ') }, { label: 'Chatters', get: (r) => Array.from(r.chatters).join(', ') },
    ])
  }

  const campo = (t, el) => <div><label className="text-xs mb-1 block" style={lbl}>{t}</label>{el}</div>
  const copiar = (u) => navigator.clipboard.writeText(u.replace(/^@+/, '')).catch(() => {})

  return (
    <div>
      <PageHeader title="Top fans" subtitle="Los fans que más han gastado, en total y por turno. Se calcula con las compras anotadas en los reportes de turno." action={<Button variant="ghost" onClick={exportar} disabled={!ranking.length}>Exportar a Excel</Button>} />
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}

      <Panel className="p-4 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
          {campo('Periodo', <Select value={preset} onChange={(e) => cambiarPreset(e.target.value)} data-f-periodo>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.n}</option>)}</Select>)}
          {campo('Chatter', <Select value={fChatter} onChange={(e) => setFChatter(e.target.value)} data-f-chatter><option value="todos">Todos</option>{chatters.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>)}
          {campo('Turno', <Select value={fTurno} onChange={(e) => setFTurno(e.target.value)} data-f-turno><option value="todos">Todos</option>{TURNOS_FAN.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}</Select>)}
          {campo('Modelo', <Select value={fModelo} onChange={(e) => setFModelo(e.target.value)} data-f-modelo><option value="todos">Todas</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}</Select>)}
          {campo('Etiqueta', <Select value={fEtiqueta} onChange={(e) => setFEtiqueta(e.target.value)} data-f-etiqueta><option value="todas">Todas</option>{todasEtiquetas.map((t) => <option key={t} value={t}>{t}</option>)}</Select>)}
          <div className="col-span-2">{campo('Buscar fan', <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="@usuario o nombre" data-f-buscar />)}</div>
        </div>
        {preset !== -1 && (
          <div className="flex items-center gap-2 mt-3 text-sm">
            <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPreset(0) }} style={{ width: 160 }} /> <span style={lbl}>→</span>
            <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPreset(0) }} style={{ width: 160 }} />
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-kpis-fans>
        {[['Fans', ranking.length.toLocaleString('es-ES')], ['Gasto total', money(total)], ['Fan nº 1', ranking[0] ? `${ranking[0].user} · ${money(ranking[0].total)}` : '—'], ['Gasto medio por fan', ranking.length ? money(total / ranking.length) : '—']].map(([t, v]) => (
          <Panel key={t} className="p-3"><p className="text-xs" style={lbl}>{t}</p><p className="font-semibold tabular-nums truncate">{v}</p></Panel>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        {[['general', 'Ranking general'], ['turnos', 'Mejores por turno']].map(([id, n]) => (
          <button key={id} onClick={() => setVista(id)} data-vista={id} className="px-4 py-1.5 rounded-full text-sm" style={{ border: '1px solid var(--border)', background: vista === id ? 'var(--accent)' : 'transparent', color: vista === id ? '#fff' : 'var(--text)' }}>{n}</button>
        ))}
      </div>

      {cargando ? <p className="text-sm" style={lbl}>Calculando…</p> : vista === 'general' ? (
        <Panel className="p-4">
          {ranking.length === 0 ? <p className="text-sm" style={lbl}>No hay compras con estos filtros.</p> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-tabla-fans>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Fan', 'Gasto total', 'PPV', 'Tips', 'Compras', 'Mañana', 'Tarde', 'Noche', 'Última compra', 'Modelos', 'Chatters'].map((c) => <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}
                  </tr></thead>
                  <tbody>
                    {ranking.slice(0, limite).map((r, i) => (
                      <tr key={r.user} style={{ borderBottom: '1px solid var(--border)' }} data-fan={r.user}>
                        <td className="px-3 py-2 tabular-nums" style={lbl}>{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap"><button type="button" onClick={() => setAbierto(r.user)} className="font-bold hover:underline text-left" data-abrir-ficha title="Abrir la ficha del fan">{r.user}</button>{r.nombre ? <span style={lbl}> · {r.nombre}</span> : null}{chips(r.user)} <button type="button" onClick={() => copiar(r.user)} className="text-xs ml-1 hover:underline" style={{ color: 'var(--accent)' }}>copiar</button></td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--success)' }}><strong>{money(r.total)}</strong></td>
                        <td className="px-3 py-2 tabular-nums">{money(r.ppv)}</td>
                        <td className="px-3 py-2 tabular-nums">{money(r.tips)}</td>
                        <td className="px-3 py-2 tabular-nums">{r.n}</td>
                        {['mañana', 'tarde', 'noche'].map((t) => <td key={t} className="px-3 py-2 tabular-nums" style={{ color: r.porTurno[t] ? 'var(--text)' : 'var(--text-muted)' }}>{r.porTurno[t] ? money(r.porTurno[t]) : '—'}</td>)}
                        <td className="px-3 py-2 whitespace-nowrap">{fmtF(r.ultima)}</td>
                        <td className="px-3 py-2" style={lbl}>{Array.from(r.modelos).join(', ')}</td>
                        <td className="px-3 py-2">{Array.from(r.chatters).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ranking.length > limite && <div className="mt-3 text-center"><Button variant="ghost" onClick={() => setLimite((l) => l + 100)}>Ver 100 más ({ranking.length - limite} restantes)</Button></div>}
              {sinMonto > 0 && <p className="text-xs mt-3" style={lbl}>{sinMonto} compras ignoradas por falta de @usuario o de cantidad. Los reportes anteriores a que se anotaran las cantidades no cuentan.</p>}
            </>
          )}
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-por-turno>
          {porTurno.map((t) => (
            <Panel key={t.id} className="p-4" data-turno-panel={t.id}>
              <p className="font-medium mb-1">{t.n}</p>
              <p className="text-xs mb-3 tabular-nums" style={lbl}>{t.lista.length} fans · {money(t.lista.reduce((a, r) => a + r.total, 0))}</p>
              {t.lista.length === 0 ? <p className="text-sm" style={lbl}>Sin compras.</p> : t.lista.slice(0, 15).map((r, i) => (
                <div key={r.user} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="w-5 text-xs tabular-nums" style={lbl}>{i + 1}</span>
                  <button type="button" onClick={() => setAbierto(r.user)} className="min-w-0 flex-1 truncate text-left hover:underline" data-abrir-ficha><strong>{r.user}</strong>{r.nombre ? <span style={lbl}> · {r.nombre}</span> : null}</button>
                  <span className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>{money(r.total)}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}
      {fanAbierto && <FichaFan fan={fanAbierto} compras={comprasDe(fanAbierto.user)} nombres={nombres} onClose={() => setAbierto(null)} onCambio={(k, nuevo) => setFichas((m) => ({ ...m, [k]: { fan_key: k, etiquetas: nuevo.etiquetas, nombre: nuevo.nombre } }))} />}
    </div>
  )
}
