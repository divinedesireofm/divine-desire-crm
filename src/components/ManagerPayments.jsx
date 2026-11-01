import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input } from './ui'
import { getProfilesByRoles } from '../lib/roles'

// ---- utilidades de fechas y dinero ----
const r2 = (n) => Math.round(n * 100) / 100
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const money = (n) => '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`            // m = 1..12
const fmtF = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}` }
const diasDelMes = (y, m) => new Date(y, m, 0).getDate()
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ROLES_MANAGER = ['manager', 'ig_manager', 'reddit_manager']
const lbl = { color: 'var(--text-muted)' }

// Mitad 1 = días 1-15 (se cobra el 16). Mitad 2 = día 16 a fin de mes (se cobra el 1 del mes siguiente).
export function rangoMitad(y, m, mitad) {
  return mitad === 1 ? { desde: 1, hasta: 15, pago: iso(y, m, 16) } : { desde: 16, hasta: diasDelMes(y, m), pago: m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1) }
}

// Cuánto toca cobrar en una mitad: mensual/2 menos (mensual/2 ÷ días de esa mitad) por cada día sin desempeñar la función.
export function calcularMitad({ mensual, y, m, mitad, diasLibres }) {
  const { desde, hasta } = rangoMitad(y, m, mitad)
  const dias = hasta - desde + 1
  const base = r2(num(mensual) / 2)
  const libres = diasLibres.filter((d) => d >= desde && d <= hasta).length
  const porDia = dias ? base / dias : 0
  const descuento = Math.min(base, r2(porDia * libres))
  return { base, libres, descuento, aPagar: r2(base - descuento), dias, porDia: r2(porDia) }
}

export default function ManagerPayments() {
  const hoy = new Date()
  const [y, setY] = useState(hoy.getFullYear())
  const [m, setM] = useState(hoy.getMonth() + 1)
  const [managers, setManagers] = useState([])
  const [config, setConfig] = useState({})   // manager_id -> sueldo mensual
  const [libres, setLibres] = useState([])   // filas manager_days_off del mes
  const [pagos, setPagos] = useState([])     // filas manager_pay_periods del mes
  const [sel, setSel] = useState('')
  const [sueldos, setSueldos] = useState({}) // edición local
  const [msg, setMsg] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cargando, setCargando] = useState(true)

  const mesIni = iso(y, m, 1)
  const mesFin = iso(y, m, diasDelMes(y, m))

  async function cargar() {
    const [profs, c, l, p] = await Promise.all([
      getProfilesByRoles(ROLES_MANAGER, { onlyActive: true }),
      supabase.from('manager_pay_config').select('*'),
      supabase.from('manager_days_off').select('*').gte('fecha', mesIni).lte('fecha', mesFin),
      supabase.from('manager_pay_periods').select('*').eq('mes', mesIni),
    ])
    if (c.error || l.error || p.error) setMsg('Falta ejecutar la migración 72 en Supabase (pagos de managers).')
    else setMsg('')
    setManagers(profs)
    const cfg = {}; (c.data || []).forEach((r) => { cfg[r.manager_id] = r.monto_mensual })
    setConfig(cfg)
    setSueldos((prev) => { const n = { ...prev }; profs.forEach((pr) => { if (n[pr.id] === undefined) n[pr.id] = cfg[pr.id] != null ? String(cfg[pr.id]) : '' }); return n })
    setLibres(l.data || [])
    setPagos(p.data || [])
    setSel((s) => s || profs[0]?.id || '')
    setCargando(false)
  }
  useEffect(() => { cargar() }, [y, m]) // eslint-disable-line

  function mover(delta) { let nm = m + delta, ny = y; if (nm < 1) { nm = 12; ny-- } if (nm > 12) { nm = 1; ny++ } setM(nm); setY(ny) }

  async function guardarSueldo(id) {
    const v = num(sueldos[id])
    const { error } = await supabase.from('manager_pay_config').upsert({ manager_id: id, monto_mensual: v, updated_at: new Date().toISOString() })
    if (error) return setMsg(error.message)
    setConfig((c) => ({ ...c, [id]: v })); setMsg('')
  }

  const diasLibresDe = (id) => libres.filter((l) => l.manager_id === id).map((l) => Number(l.fecha.slice(8, 10)))

  async function alternarDia(id, d) {
    const fecha = iso(y, m, d)
    const ya = libres.find((l) => l.manager_id === id && l.fecha === fecha)
    if (ya) {
      const { error } = await supabase.from('manager_days_off').delete().eq('id', ya.id)
      if (error) return setMsg(error.message)
    } else {
      const { error } = await supabase.from('manager_days_off').insert([{ manager_id: id, fecha }])
      if (error) return setMsg(error.message)
    }
    cargar()
  }

  async function descontarRango(id) {
    if (!desde || !hasta || desde > hasta) return setMsg('Pon un rango válido (desde ≤ hasta).')
    const filas = []
    for (let t = new Date(desde + 'T12:00:00'); t <= new Date(hasta + 'T12:00:00'); t.setDate(t.getDate() + 1)) {
      const f = iso(t.getFullYear(), t.getMonth() + 1, t.getDate())
      filas.push({ manager_id: id, fecha: f })
    }
    if (filas.length > 62) return setMsg('El rango es demasiado largo (máximo 62 días).')
    const { error } = await supabase.from('manager_days_off').upsert(filas, { onConflict: 'manager_id,fecha', ignoreDuplicates: true })
    if (error) return setMsg(error.message)
    // si el rango toca otro mes, se verá al navegar a ese mes
    setDesde(''); setHasta(''); setMsg(''); cargar()
  }

  async function guardarMotivo(l, motivo) {
    await supabase.from('manager_days_off').update({ motivo: motivo.trim() || null }).eq('id', l.id)
  }

  const calc = (id, mitad) => calcularMitad({ mensual: config[id] || 0, y, m, mitad, diasLibres: diasLibresDe(id) })
  const pagoDe = (id, mitad) => pagos.find((p) => p.manager_id === id && p.mitad === mitad)

  async function marcarPagado(id, mitad) {
    const c = calc(id, mitad)
    const { error } = await supabase.from('manager_pay_periods').upsert({
      manager_id: id, mes: mesIni, mitad, importe_base: c.base, descuento: c.descuento, dias_descontados: c.libres,
      importe_pagado: c.aPagar, pagado: true, pagado_at: new Date().toISOString(),
    }, { onConflict: 'manager_id,mes,mitad' })
    if (error) return setMsg(error.message)
    cargar()
  }
  async function deshacerPago(p) {
    const { error } = await supabase.from('manager_pay_periods').delete().eq('id', p.id)
    if (error) return setMsg(error.message)
    cargar()
  }

  const filas = useMemo(() => managers.flatMap((mg) => [1, 2].map((mitad) => ({ mg, mitad, c: calc(mg.id, mitad), p: pagoDe(mg.id, mitad), r: rangoMitad(y, m, mitad) }))), [managers, config, libres, pagos, y, m]) // eslint-disable-line
  const totalPendiente = filas.filter((f) => !f.p?.pagado).reduce((a, f) => a + f.c.aPagar, 0)
  const totalPagado = filas.filter((f) => f.p?.pagado).reduce((a, f) => a + num(f.p.importe_pagado), 0)
  const totalDescuentos = filas.reduce((a, f) => a + (f.p?.pagado ? num(f.p.descuento) : f.c.descuento), 0)

  // Calendario del manager seleccionado
  const libresSel = new Set(diasLibresDe(sel))
  const primerDiaSemana = (new Date(y, m - 1, 1).getDay() + 6) % 7 // lunes = 0
  const celdas = [...Array(primerDiaSemana).fill(null), ...Array.from({ length: diasDelMes(y, m) }, (_, i) => i + 1)]
  const selNombre = managers.find((x) => x.id === sel)?.full_name
  const listaLibresSel = libres.filter((l) => l.manager_id === sel).sort((a, b) => a.fecha.localeCompare(b.fecha))

  if (cargando) return <p className="text-sm" style={lbl}>Cargando…</p>

  return (
    <div className="space-y-5">
      <Panel className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} onClick={() => mover(-1)}>◀</button>
          <p className="font-display text-lg font-semibold w-48 text-center capitalize">{MESES[m - 1]} {y}</p>
          <button className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }} onClick={() => mover(1)}>▶</button>
          <p className="text-xs ml-auto" style={lbl}>1ª mitad (días 1–15) se paga el 16 · 2ª mitad (16–fin de mes) se paga el 1 del mes siguiente</p>
        </div>
        {msg && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{msg}</p>}
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['Pendiente de pagar', money(totalPendiente)], ['Ya pagado', money(totalPagado)], ['Descontado por días sin función', money(totalDescuentos)]].map(([t, v]) => (
          <Panel key={t} className="p-4"><p className="text-xs mb-1" style={lbl}>{t}</p><p className="font-display text-lg font-semibold tabular-nums">{v}</p></Panel>
        ))}
      </div>

      <Panel>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}><p className="font-medium">Pagos del mes</p></div>
        {managers.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay managers activos (roles manager, manager de Instagram o de Reddit).</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Manager', 'Quincena', 'Fecha de pago', 'Base', 'Días sin función', 'Descuento', 'A pagar', 'Estado', ''].map((c) => <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>
              <tbody>
                {filas.map(({ mg, mitad, c, p, r }) => {
                  const pagado = !!p?.pagado
                  const cambio = pagado && Math.abs(num(p.importe_pagado) - c.aPagar) > 0.009
                  return (
                    <tr key={mg.id + mitad} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">{mitad === 1 ? mg.full_name : ''}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{mitad === 1 ? '1ª' : '2ª'} · días {r.desde}–{r.hasta}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{fmtF(r.pago)}</td>
                      <td className="px-3 py-3 tabular-nums">{money(pagado ? p.importe_base : c.base)}</td>
                      <td className="px-3 py-3 tabular-nums">{pagado ? p.dias_descontados : c.libres}</td>
                      <td className="px-3 py-3 tabular-nums" style={{ color: (pagado ? p.descuento : c.descuento) > 0 ? 'var(--danger)' : undefined }}>{(pagado ? p.descuento : c.descuento) > 0 ? '−' + money(pagado ? p.descuento : c.descuento) : '—'}</td>
                      <td className="px-3 py-3 tabular-nums font-semibold">{money(pagado ? p.importe_pagado : c.aPagar)}{cambio && <span className="block text-xs font-normal" style={{ color: 'var(--gold)' }}>ahora saldría {money(c.aPagar)}</span>}</td>
                      <td className="px-3 py-3 whitespace-nowrap"><span style={{ color: pagado ? 'var(--success)' : 'var(--gold)' }}>{pagado ? '✓ Pagado' : 'Pendiente'}</span></td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {pagado ? <button className="text-xs underline" style={lbl} onClick={() => { if (window.confirm('¿Deshacer este pago y volver a dejarlo pendiente?')) deshacerPago(p) }}>Deshacer</button>
                          : <button className="text-xs underline" style={{ color: 'var(--accent)' }} disabled={!num(config[mg.id])} title={!num(config[mg.id]) ? 'Primero pon su sueldo mensual' : ''} onClick={() => marcarPagado(mg.id, mitad)}>Marcar pagado</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel className="p-4">
          <p className="font-medium mb-3">Sueldo mensual de cada manager</p>
          <div className="space-y-2">
            {managers.map((mg) => (
              <div key={mg.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{mg.full_name}</span>
                <div className="w-32"><Input type="number" min="0" step="0.01" placeholder="0.00" value={sueldos[mg.id] ?? ''} onChange={(e) => setSueldos((s) => ({ ...s, [mg.id]: e.target.value }))} /></div>
                <Button onClick={() => guardarSueldo(mg.id)} disabled={num(sueldos[mg.id]) === num(config[mg.id]) && (config[mg.id] != null || sueldos[mg.id] === '')}>Guardar</Button>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={lbl}>Cada quincena cobra la mitad. Por cada día sin desempeñar la función se descuenta la mitad dividida entre los días de esa quincena. Si cambias el sueldo, los pagos ya marcados como pagados no se tocan.</p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="font-medium">Calendario de días sin función</p>
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-md px-3 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {managers.map((mg) => <option key={mg.id} value={mg.id}>{mg.full_name}</option>)}
            </select>
          </div>
          {sel ? (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1" style={lbl}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d}>{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((d, i) => d === null ? <span key={'v' + i} /> : (
                  <button key={d} type="button" onClick={() => alternarDia(sel, d)} title={libresSel.has(d) ? 'Quitar descuento' : 'Marcar como día sin función'}
                    className="rounded-md py-2 text-sm tabular-nums"
                    style={{ background: libresSel.has(d) ? 'var(--danger)' : d <= 15 ? 'var(--panel-alt)' : 'var(--accent-soft)', color: libresSel.has(d) ? '#fff' : 'var(--text)', border: '1px solid var(--border)', fontWeight: libresSel.has(d) ? 700 : 400 }}>{d}</button>
                ))}
              </div>
              <p className="text-xs mt-2" style={lbl}>Pulsa un día para descontarlo (rojo); púlsalo otra vez para quitarlo. Gris = 1ª quincena · dorado = 2ª quincena.</p>
              <div className="flex items-end gap-2 mt-3 flex-wrap">
                <div><label className="text-xs block mb-1" style={lbl}>Rango desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <div><label className="text-xs block mb-1" style={lbl}>hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <Button onClick={() => descontarRango(sel)}>Descontar rango</Button>
              </div>
              {listaLibresSel.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs" style={lbl}>Días descontados a {selNombre} este mes ({listaLibresSel.length}) — puedes anotar el motivo:</p>
                  {listaLibresSel.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 tabular-nums">{fmtF(l.fecha).slice(0, 5)}</span>
                      <input defaultValue={l.motivo || ''} placeholder="Motivo (opcional)" onBlur={(e) => guardarMotivo(l, e.target.value)} className="flex-1 rounded-md px-2 py-1 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => alternarDia(sel, Number(l.fecha.slice(8, 10)))}>Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-sm" style={lbl}>No hay managers.</p>}
        </Panel>
      </div>
    </div>
  )
}
