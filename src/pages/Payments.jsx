import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import { fmtMoney, buildCompMap, calcPagoRow } from '../lib/pagos'
import { getProfilesByRoles } from '../lib/roles'
import MultiMonto from '../components/MultiMonto'

function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function fmtFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function Payments() {
  const { hasRole } = useAuth()
  return hasRole('admin') ? <PagosAdmin /> : <MisPagos />
}

function PagosAdmin() {
  const { profile } = useAuth()
  const [periodos, setPeriodos] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [fecha, setFecha] = useState(fechaHoyISO())
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [buscarPersona, setBuscarPersona] = useState(false)

  async function load() {
    const { data } = await supabase.from('payment_periods').select('*').order('fecha', { ascending: false })
    setPeriodos(data || [])
  }
  useEffect(() => { load() }, [])

  async function crear() {
    const { data } = await supabase.from('payment_periods').insert([{ fecha, creado_por: profile.id }]).select().single()
    setNuevo(false)
    await load()
    setAbierto(data.id)
  }

  async function borrar(p) {
    if (!confirm(`¿Eliminar el periodo de pago del ${fmtFecha(p.fecha)} y todos sus cálculos?`)) return
    await supabase.from('payment_periods').delete().eq('id', p.id)
    load()
  }

  if (abierto) return <PeriodoEditor pid={abierto} onBack={() => { setAbierto(null); load() }} />

  const periodosVisibles = periodos.filter((p) => (!fDesde || p.fecha >= fDesde) && (!fHasta || p.fecha <= fHasta))

  return (
    <div>
      <PageHeader
        title="Pagos"
        subtitle="Crea periodos de pago y calcula lo que cobra cada miembro del equipo. Cada miembro ve únicamente sus propios pagos."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setBuscarPersona(!buscarPersona)}>{buscarPersona ? 'Cerrar búsqueda' : 'Buscar por persona'}</Button>
            <Button onClick={() => { setFecha(fechaHoyISO()); setNuevo(true) }}>+ Nuevo periodo</Button>
          </div>
        }
      />

      {buscarPersona && <BuscarPagosPorPersona />}

      <div className="flex gap-2 mb-3 max-w-md">
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Desde</label>
          <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Hasta</label>
          <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
        </div>
      </div>

      <Panel className="p-3">
        {periodosVisibles.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
            {periodos.length === 0 ? 'Aún no has creado periodos de pago.' : 'Ningún periodo en ese rango de fechas.'}
          </p>
        ) : periodosVisibles.map((p) => (
          <div
            key={p.id}
            onClick={() => setAbierto(p.id)}
            className="flex items-center gap-3 px-3 py-3 rounded-md cursor-pointer hover:opacity-80"
          >
            <strong>Periodo {fmtFecha(p.fecha)}</strong>
            <span className="ml-auto text-sm" style={{ color: 'var(--text-muted)' }}>{p.nota || 'abrir'}</span>
            <button onClick={(e) => { e.stopPropagation(); borrar(p) }} style={{ color: 'var(--danger)' }}>✕</button>
          </div>
        ))}
      </Panel>

      {nuevo && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">Nuevo periodo de pago</p>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Fecha del pago</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mb-3 max-w-xs" />
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Se creará una fila por cada miembro del equipo (excepto tú), con su % recordado del último pago.
          </p>
          <div className="flex gap-2">
            <Button onClick={crear}>Crear</Button>
            <Button variant="ghost" onClick={() => setNuevo(false)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

function BuscarPagosPorPersona() {
  const [personas, setPersonas] = useState([])
  const [personaId, setPersonaId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    getProfilesByRoles(['manager', 'chatter']).then((data) => {
      setPersonas(data)
      if (data.length) setPersonaId(data[0].id)
    })
  }, [])

  async function buscar() {
    if (!personaId) return
    setBuscando(true)
    let q = supabase.from('payments').select('*, payment_periods!inner(fecha)').eq('chatter_id', personaId)
    if (desde) q = q.gte('payment_periods.fecha', desde)
    if (hasta) q = q.lte('payment_periods.fecha', hasta)
    const { data } = await q.order('fecha', { foreignTable: 'payment_periods', ascending: false })
    setResultados(data || [])
    setBuscando(false)
  }

  const total = (resultados || []).reduce((s, r) => s + (Number(r.a_pagar) || 0), 0)

  return (
    <Panel className="p-5 mb-4">
      <p className="text-sm font-medium mb-3">Buscar pagos por persona y rango de fechas</p>
      <div className="flex gap-2 flex-wrap mb-3">
        <Select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="max-w-[200px]">
          {personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </Select>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="max-w-[160px]" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="max-w-[160px]" />
        <Button onClick={buscar} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</Button>
      </div>
      {resultados && (
        resultados.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin pagos en ese rango.</p>
        ) : (
          <>
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
              {resultados.length} pago(s) · Total: <strong style={{ color: 'var(--text)' }}>${total.toFixed(2)}</strong>
            </p>
            <div className="space-y-1">
              {resultados.map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span>{fmtFecha(r.payment_periods.fecha)}</span>
                  <span>${Number(r.a_pagar).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </Panel>
  )
}

function PeriodoEditor({ pid, onBack }) {
  const [rows, setRows] = useState([])
  const [comps, setComps] = useState([])
  const [periodo, setPeriodo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [nc, setNc] = useState({ vendedor_id: '', dueno_id: '', monto_bruto: '', nota: '' })
  const [chatters, setChatters] = useState([])

  async function load() {
    const [{ data: per }, { data: rowsRaw }, { data: chattersData }, { data: compsRaw }, { data: hist }] = await Promise.all([
      supabase.from('payment_periods').select('*').eq('id', pid).single(),
      supabase.from('payments').select('*').eq('periodo_id', pid),
      supabase.from('profiles').select('id, full_name').in('role', ['manager', 'chatter']).order('full_name'),
      supabase.from('payment_companions').select('*').eq('periodo_id', pid),
      supabase.from('payments').select('chatter_id, pct').order('created_at', { ascending: false }).limit(300),
    ])
    setPeriodo(per)
    setChatters(chattersData || [])
    const lastPct = {}
    for (const h of hist || []) { if (lastPct[h.chatter_id] === undefined) lastPct[h.chatter_id] = h.pct }
    const byCh = {}
    ;(rowsRaw || []).forEach((r) => { byCh[r.chatter_id] = r })
    const ids = (chattersData || []).map((c) => c.id)
    ;(rowsRaw || []).forEach((r) => { if (!ids.includes(r.chatter_id)) ids.push(r.chatter_id) })
    const built = ids.map((id) => byCh[id] || {
      chatter_id: id, facturacion: 0, pct: lastPct[id] !== undefined ? lastPct[id] : 0.10,
      sanciones: [], metas_equipo: [], metas_mensuales: [], ventas_faltantes: [],
    })
    setRows(built)
    setComps(compsRaw || [])
  }
  useEffect(() => { load() }, [pid])

  const compMap = useMemo(() => buildCompMap(comps), [comps])
  function setRow(chatterId, patch) {
    setRows((rs) => rs.map((r) => r.chatter_id === chatterId ? { ...r, ...patch } : r))
  }
  function addComp() {
    const monto = parseFloat(nc.monto_bruto)
    if (!nc.vendedor_id || !nc.dueno_id) return
    if (nc.vendedor_id === nc.dueno_id) return
    if (isNaN(monto) || monto <= 0) return
    setComps((cs) => cs.concat([{ vendedor_id: nc.vendedor_id, dueno_id: nc.dueno_id, monto_bruto: monto, nota: nc.nota.trim() }]))
    setNc({ vendedor_id: '', dueno_id: '', monto_bruto: '', nota: '' })
  }
  function delComp(i) { setComps((cs) => cs.filter((_, j) => j !== i)) }

  const totalPagar = useMemo(() => rows.reduce((s, r) => s + calcPagoRow(r, compMap[r.chatter_id]).aPagar, 0), [rows, compMap])
  const nombre = (id) => chatters.find((c) => c.id === id)?.full_name || '—'

  async function guardar() {
    setBusy(true)
    await supabase.from('payment_companions').delete().eq('periodo_id', pid)
    if (comps.length) {
      await supabase.from('payment_companions').insert(comps.map((c) => ({
        periodo_id: pid, vendedor_id: c.vendedor_id, dueno_id: c.dueno_id,
        monto_bruto: parseFloat(c.monto_bruto) || 0, nota: c.nota || '',
      })))
    }
    for (const r of rows) {
      const calc = calcPagoRow(r, compMap[r.chatter_id])
      const payload = {
        periodo_id: pid, chatter_id: r.chatter_id,
        facturacion: parseFloat(r.facturacion) || 0, pct: parseFloat(r.pct) || 0,
        sanciones: r.sanciones || [], metas_equipo: r.metas_equipo || [],
        metas_mensuales: r.metas_mensuales || [], ventas_faltantes: r.ventas_faltantes || [],
        ventas_companeros: calc.E, a_pagar: calc.aPagar,
      }
      await supabase.from('payments').upsert(payload, { onConflict: 'periodo_id,chatter_id' })
    }
    setMsg('Guardado ✓')
    setBusy(false)
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div>
      <PageHeader
        title={`Periodo ${periodo ? fmtFecha(periodo.fecha) : ''}`}
        subtitle={<>Edita facturación y % de cada uno. Total a pagar: <strong style={{ color: 'var(--text)' }}>{fmtMoney(totalPagar)}</strong></>}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>← Volver</Button>
            <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : (msg || 'Guardar todo')}</Button>
          </div>
        }
      />

      <Panel className="p-5 mb-6">
        <p className="font-medium mb-1">Ventas entre compañeros</p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
          Si alguien vende contenido de otro: el sistema quita el 20% de OnlyFans y reparte el resto 50/50. Suma a la facturación del vendedor y resta a la del dueño.
        </p>
        {comps.map((c, i) => {
          const net = (parseFloat(c.monto_bruto) || 0) * 0.8 / 2
          return (
            <div key={i} className="flex items-center gap-3 text-sm py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span><strong>{nombre(c.vendedor_id)}</strong> vendió {fmtMoney(c.monto_bruto)} de <strong>{nombre(c.dueno_id)}</strong>{c.nota ? ` · ${c.nota}` : ''}</span>
              <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>+{fmtMoney(net)} a {nombre(c.vendedor_id)} · −{fmtMoney(net)} a {nombre(c.dueno_id)}</span>
              <button onClick={() => delComp(i)} style={{ color: 'var(--danger)' }}>✕</button>
            </div>
          )
        })}
        <div className="flex gap-2 mt-3">
          <Select value={nc.vendedor_id} onChange={(e) => setNc({ ...nc, vendedor_id: e.target.value })} className="max-w-[160px]">
            <option value="">Vendedor…</option>
            {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </Select>
          <Select value={nc.dueno_id} onChange={(e) => setNc({ ...nc, dueno_id: e.target.value })} className="max-w-[160px]">
            <option value="">Dueño…</option>
            {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </Select>
          <Input type="number" step="0.01" placeholder="$ bruto" value={nc.monto_bruto} onChange={(e) => setNc({ ...nc, monto_bruto: e.target.value })} className="max-w-[110px]" />
          <Input placeholder="nota (opcional)" value={nc.nota} onChange={(e) => setNc({ ...nc, nota: e.target.value })} />
          <Button variant="ghost" onClick={addComp}>Añadir</Button>
        </div>
      </Panel>

      {rows.map((r) => {
        const c = calcPagoRow(r, compMap[r.chatter_id])
        return (
          <Panel key={r.chatter_id} className="p-5 mb-4">
            <div className="flex justify-between items-center mb-4">
              <strong>{nombre(r.chatter_id)}</strong>
              <span>A pagar: <strong className="gold-text">{fmtMoney(c.aPagar)}</strong></span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Facturación neta (sin 20% OF)</label>
                <Input type="number" step="0.01" value={r.facturacion} onChange={(e) => setRow(r.chatter_id, { facturacion: e.target.value })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>% chatter</label>
                <Input type="number" step="0.01" value={r.pct} onChange={(e) => setRow(r.chatter_id, { pct: e.target.value })} placeholder="0.10" />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Metas por mil (auto)</label>
                <Input value={fmtMoney(c.I)} disabled />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Ventas compañeros (auto)</label>
                <Input value={(c.E >= 0 ? '+' : '−') + fmtMoney(Math.abs(c.E))} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Ventas faltantes (bruto, −20% OF)</label>
                <MultiMonto items={r.ventas_faltantes} montoKey="bruto" onChange={(v) => setRow(r.chatter_id, { ventas_faltantes: v })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Metas equipo</label>
                <MultiMonto items={r.metas_equipo} onChange={(v) => setRow(r.chatter_id, { metas_equipo: v })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Metas mensuales</label>
                <MultiMonto items={r.metas_mensuales} onChange={(v) => setRow(r.chatter_id, { metas_mensuales: v })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Sanciones (se restan)</label>
                <MultiMonto items={r.sanciones} onChange={(v) => setRow(r.chatter_id, { sanciones: v })} />
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}

function MisPagos() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [periodos, setPeriodos] = useState({})

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: ps }] = await Promise.all([
        supabase.from('payments').select('*').eq('chatter_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('payment_periods').select('*').order('fecha', { ascending: false }),
      ])
      const pm = {}
      ;(ps || []).forEach((p) => { pm[p.id] = p })
      setPeriodos(pm)
      setRows(r || [])
    }
    if (profile) load()
  }, [profile])

  return (
    <div>
      <PageHeader title="Mis pagos" subtitle="El detalle de lo que has cobrado en cada periodo." />
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes pagos registrados.</p>
      ) : rows.map((r) => {
        const c = calcPagoRow(r)
        const p = periodos[r.periodo_id]
        return (
          <Panel key={r.id} className="p-5 mb-4">
            <div className="flex justify-between items-center mb-4">
              <strong>{p ? `Periodo ${fmtFecha(p.fecha)}` : 'Periodo'}</strong>
              <span>A pagar: <strong className="gold-text">{fmtMoney(c.aPagar)}</strong></span>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                ['Facturación neta', fmtMoney(c.C)],
                ['+ Ventas compañeros', (c.E >= 0 ? '+' : '−') + fmtMoney(Math.abs(c.E))],
                ['+ Ventas faltantes (neto)', '+' + fmtMoney(c.Jnet)],
                [`× Comisión ${(c.D * 100).toFixed(0)}%`, fmtMoney(c.comision)],
                ['+ Metas equipo', '+' + fmtMoney(c.G)],
                ['+ Metas mensuales', '+' + fmtMoney(c.H)],
                ['+ Metas por mil', '+' + fmtMoney(c.I)],
                ['− Sanciones', '−' + fmtMoney(c.F)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <strong>{val}</strong>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span>A pagar</span>
                <strong className="gold-text">{fmtMoney(c.aPagar)}</strong>
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
