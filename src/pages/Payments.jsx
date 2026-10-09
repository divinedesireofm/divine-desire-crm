import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

// ---------- utilidades ----------
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100
const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const OF_NETO = 0.8 // OnlyFans se queda el 20 %: neta = bruta × 80 %

// Misma fórmula que el Excel: (neta × %) + bonos + adelanto + penalización + deuda
export function calcPago(p) {
  return r2(num(p.fact_neta) * num(p.pct) + num(p.bonos) + num(p.adelanto) + num(p.penalizacion) + num(p.deuda))
}

const VACIO = { account_id: '', fecha: hoyISO(), bruta: '', neta: '', pct: '', bonos: '', adelanto: '', penalizacion: '', deuda: '', notas: '', estado: 'Pagado' }

export default function Payments() {
  const { hasRole } = useAuth()
  return hasRole('admin') ? <PagosAdmin /> : <MisPagos />
}

// =====================================================================================
// ADMIN
// =====================================================================================
function PagosAdmin() {
  const [cuentas, setCuentas] = useState([])
  const [pagos, setPagos] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [sel, setSel] = useState('todas')
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(null)       // formulario de pago (null = cerrado)
  const [editId, setEditId] = useState(null)
  const [cform, setCform] = useState(null)     // formulario de cuenta
  const [msg, setMsg] = useState('')

  async function cargar() {
    const [{ data: c }, { data: p }, { data: pr }] = await Promise.all([
      supabase.from('payout_accounts').select('*').order('created_at'),
      supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }).limit(5000),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ])
    setCuentas(c || []); setPagos(p || []); setPerfiles(pr || []); setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const cuentaDe = (id) => cuentas.find((c) => c.id === id)
  const visibles = useMemo(() => pagos.filter((p) => sel === 'todas' || p.account_id === sel), [pagos, sel])

  const resumen = useMemo(() => {
    const mes = hoyISO().slice(0, 7)
    const pagados = visibles.filter((p) => p.estado === 'Pagado')
    return {
      total: r2(pagados.reduce((s, p) => s + calcPago(p), 0)),
      mes: r2(pagados.filter((p) => p.fecha.startsWith(mes)).reduce((s, p) => s + calcPago(p), 0)),
      pendiente: r2(visibles.filter((p) => p.estado === 'Pendiente').reduce((s, p) => s + calcPago(p), 0)),
      neta: r2(visibles.reduce((s, p) => s + num(p.fact_neta), 0)),
      n: visibles.length,
    }
  }, [visibles])

  // ---------- pago ----------
  function nuevoPago() {
    const c = sel !== 'todas' ? cuentaDe(sel) : null
    setEditId(null)
    setForm({ ...VACIO, fecha: hoyISO(), account_id: c?.id || cuentas[0]?.id || '', pct: c?.pct_defecto ?? 0.15 })
  }
  function editarPago(p) {
    setEditId(p.id)
    setForm({
      account_id: p.account_id, fecha: p.fecha, bruta: p.fact_bruta ?? '', neta: p.fact_neta ?? '', pct: p.pct ?? '',
      bonos: p.bonos || '', adelanto: p.adelanto || '', penalizacion: Math.abs(num(p.penalizacion)) || '', deuda: Math.abs(num(p.deuda)) || '',
      notas: p.notas || '', estado: p.estado,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function setF(patch) { setForm((f) => ({ ...f, ...patch })) }
  function alCambiarBruta(v) { setF({ bruta: v, neta: v === '' ? '' : r2(num(v) * OF_NETO) }) }
  function alCambiarNeta(v) { setF({ neta: v, bruta: v === '' ? '' : r2(num(v) / OF_NETO) }) }
  function alCambiarCuenta(id) { const c = cuentaDe(id); setF({ account_id: id, pct: c?.pct_defecto ?? form.pct }) }

  const previo = form ? calcPago({ fact_neta: form.neta, pct: form.pct, bonos: form.bonos, adelanto: form.adelanto, penalizacion: -Math.abs(num(form.penalizacion)), deuda: -Math.abs(num(form.deuda)) }) : 0

  async function guardarPago(e) {
    e.preventDefault()
    if (!form.account_id || !form.fecha) return
    const payload = {
      account_id: form.account_id, fecha: form.fecha,
      fact_bruta: form.bruta === '' ? null : num(form.bruta), fact_neta: form.neta === '' ? null : num(form.neta),
      pct: form.pct === '' ? null : num(form.pct), bonos: num(form.bonos), adelanto: num(form.adelanto),
      penalizacion: -Math.abs(num(form.penalizacion)), deuda: -Math.abs(num(form.deuda)),
      notas: form.notas.trim() || null, estado: form.estado,
    }
    const { error } = editId
      ? await supabase.from('chatter_payouts').update(payload).eq('id', editId)
      : await supabase.from('chatter_payouts').insert([payload])
    if (error) { setMsg(error.code === '23505' ? 'Ya existe un pago de esa cuenta en esa fecha. Edítalo o cambia la fecha.' : 'No se pudo guardar: ' + error.message); return }
    setMsg(''); setForm(null); setEditId(null); cargar()
  }
  async function borrarPago(p) {
    if (!confirm(`¿Eliminar el pago de ${cuentaDe(p.account_id)?.nombre} del ${fmtF(p.fecha)}?`)) return
    await supabase.from('chatter_payouts').delete().eq('id', p.id); cargar()
  }
  async function marcarPagado(p) {
    await supabase.from('chatter_payouts').update({ estado: 'Pagado' }).eq('id', p.id); cargar()
  }

  // ---------- cuenta ----------
  function editarCuenta(c) {
    setCform(c ? { ...c, pct_defecto: c.pct_defecto ?? 0.15, profile_id: c.profile_id || '' }
      : { nombre: '', profile_id: '', fecha_inicio: hoyISO(), pct_defecto: 0.15, wallet_usdc_eth: '', wallet_usdc_bsc: '', wallet_usdt_bsc: '', wallet_binance: '', activa: true })
  }
  async function guardarCuenta(e) {
    e.preventDefault()
    const payload = {
      nombre: cform.nombre.trim(), profile_id: cform.profile_id || null, fecha_inicio: cform.fecha_inicio || null,
      pct_defecto: num(cform.pct_defecto), wallet_usdc_eth: cform.wallet_usdc_eth?.trim() || null, wallet_usdc_bsc: cform.wallet_usdc_bsc?.trim() || null,
      wallet_usdt_bsc: cform.wallet_usdt_bsc?.trim() || null, wallet_binance: cform.wallet_binance?.trim() || null, activa: cform.activa,
    }
    if (!payload.nombre) return
    const { error } = cform.id
      ? await supabase.from('payout_accounts').update(payload).eq('id', cform.id)
      : await supabase.from('payout_accounts').insert([payload])
    if (error) { setMsg('No se pudo guardar la cuenta: ' + error.message); return }
    setMsg(''); setCform(null); cargar()
  }
  async function borrarCuenta(c) {
    if (!confirm(`¿Eliminar la cuenta «${c.nombre}» y TODOS sus pagos registrados? No se puede deshacer.`)) return
    await supabase.from('payout_accounts').delete().eq('id', c.id); setSel('todas'); cargar()
  }

  const cuentaSel = sel !== 'todas' ? cuentaDe(sel) : null
  const lbl = { color: 'var(--text-muted)' }

  return (
    <div>
      <PageHeader
        title="Pagos a chatters"
        subtitle="Registro de lo pagado a cada chatter. Introduces la facturación de Infloww y el pago se calcula solo con la misma fórmula del Excel."
        action={<div className="flex gap-2"><Button variant="ghost" onClick={() => editarCuenta(null)}>+ Cuenta</Button><Button onClick={nuevoPago} disabled={!cuentas.length}>+ Registrar pago</Button></div>}
      />

      {msg && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{msg}</p>}

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          ['Total pagado', money(resumen.total), true],
          ['Pagado este mes', money(resumen.mes)],
          ['Pendiente de pago', money(resumen.pendiente)],
          ['Facturación neta registrada', money(resumen.neta)],
        ].map(([t, v, g]) => (
          <Panel key={t} className="p-4">
            <p className="text-xs mb-1" style={lbl}>{t}</p>
            <p className={`text-xl font-display font-semibold tabular-nums ${g ? 'gold-text' : ''}`}>{v}</p>
          </Panel>
        ))}
      </div>

      {/* Selector de cuenta */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ id: 'todas', nombre: 'Todos' }, ...cuentas].map((c) => {
          const on = sel === c.id
          return (
            <button key={c.id} onClick={() => setSel(c.id)} className="px-3 py-1.5 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)', opacity: c.activa === false ? 0.55 : 1 }}>
              {c.nombre}
            </button>
          )
        })}
      </div>

      {/* Ficha de la cuenta */}
      {cuentaSel && (
        <Panel className="p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-medium">{cuentaSel.nombre}{cuentaSel.activa === false && <span className="text-xs ml-2" style={lbl}>(inactiva)</span>}</p>
              <p className="text-xs mt-1" style={lbl}>
                Inicio: {cuentaSel.fecha_inicio ? fmtF(cuentaSel.fecha_inicio) : '—'} · % habitual: {Math.round(num(cuentaSel.pct_defecto) * 100)}% ·
                Usuario del CRM: {perfiles.find((p) => p.id === cuentaSel.profile_id)?.full_name || 'sin enlazar'}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={() => editarCuenta(cuentaSel)} className="hover:underline" style={{ color: 'var(--accent)' }}>Editar cuenta</button>
              <button onClick={() => borrarCuenta(cuentaSel)} className="hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[['USDC · ETH', cuentaSel.wallet_usdc_eth], ['USDC · BSC', cuentaSel.wallet_usdc_bsc], ['USDT · BSC', cuentaSel.wallet_usdt_bsc], ['Binance', cuentaSel.wallet_binance]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <span style={lbl} className="shrink-0">{k}</span>
                <code className="truncate flex-1">{v}</code>
                <CopyButton text={v} label="Copiar" />
              </div>
            ))}
            {!cuentaSel.wallet_usdc_eth && !cuentaSel.wallet_usdc_bsc && !cuentaSel.wallet_usdt_bsc && !cuentaSel.wallet_binance && <p className="text-xs" style={lbl}>Sin direcciones guardadas.</p>}
          </div>
        </Panel>
      )}

      {/* Formulario de cuenta */}
      {cform && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">{cform.id ? 'Editar cuenta' : 'Nueva cuenta de pago'}</p>
          <form onSubmit={guardarCuenta} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs block mb-1" style={lbl}>Nombre</label><Input value={cform.nombre} onChange={(e) => setCform({ ...cform, nombre: e.target.value })} required /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Usuario del CRM (para que vea sus pagos)</label>
              <Select value={cform.profile_id} onChange={(e) => setCform({ ...cform, profile_id: e.target.value })}>
                <option value="">Sin enlazar</option>
                {perfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select></div>
            <div><label className="text-xs block mb-1" style={lbl}>Fecha de inicio</label><Input type="date" value={cform.fecha_inicio || ''} onChange={(e) => setCform({ ...cform, fecha_inicio: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>% habitual (0.15 = 15 %)</label><Input type="number" step="0.01" value={cform.pct_defecto} onChange={(e) => setCform({ ...cform, pct_defecto: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDC · ETH</label><Input value={cform.wallet_usdc_eth || ''} onChange={(e) => setCform({ ...cform, wallet_usdc_eth: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDC · BSC</label><Input value={cform.wallet_usdc_bsc || ''} onChange={(e) => setCform({ ...cform, wallet_usdc_bsc: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección USDT · BSC</label><Input value={cform.wallet_usdt_bsc || ''} onChange={(e) => setCform({ ...cform, wallet_usdt_bsc: e.target.value })} /></div>
            <div><label className="text-xs block mb-1" style={lbl}>Dirección de Binance</label><Input value={cform.wallet_binance || ''} onChange={(e) => setCform({ ...cform, wallet_binance: e.target.value })} /></div>
            <label className="text-sm flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={cform.activa} onChange={(e) => setCform({ ...cform, activa: e.target.checked })} /> Cuenta activa</label>
            <div className="sm:col-span-2 flex gap-2"><Button type="submit">Guardar cuenta</Button><Button type="button" variant="ghost" onClick={() => setCform(null)}>Cancelar</Button></div>
          </form>
        </Panel>
      )}

      {/* Formulario de pago */}
      {form && (
        <Panel className="p-5 mb-4">
          <p className="text-sm font-medium mb-3">{editId ? 'Editar pago' : 'Registrar pago'}</p>
          <form onSubmit={guardarPago}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label className="text-xs block mb-1" style={lbl}>Chatter</label>
                <Select value={form.account_id} onChange={(e) => alCambiarCuenta(e.target.value)} required>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select></div>
              <div><label className="text-xs block mb-1" style={lbl}>Fecha del pago</label><Input type="date" value={form.fecha} onChange={(e) => setF({ fecha: e.target.value })} required /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Facturación bruta ($)</label><Input type="number" step="0.01" value={form.bruta} onChange={(e) => alCambiarBruta(e.target.value)} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Facturación neta ($) · bruta −20 %</label><Input type="number" step="0.01" value={form.neta} onChange={(e) => alCambiarNeta(e.target.value)} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>% para el chatter (0.15)</label><Input type="number" step="0.01" value={form.pct} onChange={(e) => setF({ pct: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Bonos (+)</label><Input type="number" step="0.01" value={form.bonos} onChange={(e) => setF({ bonos: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Adelanto pagado (+)</label><Input type="number" step="0.01" value={form.adelanto} onChange={(e) => setF({ adelanto: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Penalización (se resta)</label><Input type="number" step="0.01" min="0" value={form.penalizacion} onChange={(e) => setF({ penalizacion: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Deuda a descontar (se resta)</label><Input type="number" step="0.01" min="0" value={form.deuda} onChange={(e) => setF({ deuda: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Estado</label>
                <Select value={form.estado} onChange={(e) => setF({ estado: e.target.value })}><option>Pagado</option><option>Pendiente</option></Select></div>
              <div className="col-span-2"><label className="text-xs block mb-1" style={lbl}>Notas</label><Input value={form.notas} onChange={(e) => setF({ notas: e.target.value })} placeholder="Ej: descontar 25 dólares, bono quincenal…" /></div>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Button type="submit">{editId ? 'Guardar cambios' : 'Guardar pago'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setForm(null); setEditId(null); setMsg('') }}>Cancelar</Button>
              <span className="ml-auto text-sm">Pago al chatter: <strong className="gold-text text-base tabular-nums">{money(previo)}</strong></span>
            </div>
          </form>
        </Panel>
      )}

      {/* Tabla */}
      <Panel>
        {cargando ? <p className="p-6 text-sm" style={lbl}>Cargando…</p> : visibles.length === 0 ? (
          <p className="p-6 text-sm text-center" style={lbl}>No hay pagos registrados{cuentaSel ? ' para esta cuenta' : ''}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', ...(sel === 'todas' ? ['Chatter'] : []), 'Bruta', 'Neta', '%', 'Bonos', 'Adelanto', 'Penaliz.', 'Deuda', 'Pago', 'Estado', 'Notas', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap" style={lbl}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const celda = (v) => (num(v) ? money(v) : <span style={lbl}>—</span>)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtF(p.fecha)}</td>
                      {sel === 'todas' && <td className="px-3 py-2.5 whitespace-nowrap">{cuentaDe(p.account_id)?.nombre}</td>}
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.fact_bruta)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.fact_neta)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{p.pct != null ? Math.round(num(p.pct) * 100) + '%' : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.bonos)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{celda(p.adelanto)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: num(p.penalizacion) ? 'var(--danger)' : undefined }}>{celda(p.penalizacion)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: num(p.deuda) ? 'var(--danger)' : undefined }}>{celda(p.deuda)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold gold-text whitespace-nowrap">{money(calcPago(p))}</td>
                      <td className="px-3 py-2.5">
                        {p.estado === 'Pagado'
                          ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>Pagado</span>
                          : <button onClick={() => marcarPagado(p)} title="Marcar como pagado" className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Pendiente ✓</button>}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[240px]" style={lbl}>{p.notas || ''}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        <button onClick={() => editarPago(p)} className="hover:underline mr-3" style={{ color: 'var(--accent)' }}>Editar</button>
                        <button onClick={() => borrarPago(p)} style={{ color: 'var(--danger)' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// =====================================================================================
// CHATTER / MANAGER: solo ve sus propios pagos
// =====================================================================================
function MisPagos() {
  const [filas, setFilas] = useState(null)
  useEffect(() => {
    supabase.from('chatter_payouts').select('*').order('fecha', { ascending: false }).then(({ data }) => setFilas(data || []))
  }, [])
  const total = (filas || []).filter((p) => p.estado === 'Pagado').reduce((s, p) => s + calcPago(p), 0)
  return (
    <div>
      <PageHeader title="Mis pagos" subtitle="El detalle de lo que has cobrado en cada pago." />
      {filas === null ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        : filas.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no tienes pagos registrados.</p>
        : (
          <>
            <Panel className="p-4 mb-4 inline-block min-w-[220px]">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total cobrado</p>
              <p className="text-xl font-display font-semibold gold-text tabular-nums">{money(total)}</p>
            </Panel>
            {filas.map((p) => (
              <Panel key={p.id} className="p-5 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <strong>Pago del {fmtF(p.fecha)}</strong>
                  <span>{p.estado === 'Pagado' ? 'Pagado' : 'Pendiente'} · <strong className="gold-text">{money(calcPago(p))}</strong></span>
                </div>
                <div className="space-y-1.5 text-sm">
                  {[
                    ['Facturación neta', money(p.fact_neta)],
                    [`× Comisión ${Math.round(num(p.pct) * 100)}%`, money(num(p.fact_neta) * num(p.pct))],
                    ['+ Bonos', money(p.bonos)],
                    ['+ Adelanto', money(p.adelanto)],
                    ['− Penalización', money(p.penalizacion)],
                    ['− Deuda descontada', money(p.deuda)],
                  ].filter(([, v], i) => i < 2 || v !== '$0.00').map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{k}</span><strong>{v}</strong></div>
                  ))}
                </div>
                {p.notas && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{p.notas}</p>}
              </Panel>
            ))}
          </>
        )}
    </div>
  )
}
