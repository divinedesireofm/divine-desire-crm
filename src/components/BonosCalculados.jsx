import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { num, fmtNum } from '../lib/numeros'
import { calcularBono, escalonesOrdenados, resumenEscalones, textoEscalon, periodosBono, fechaPagoPeriodo, sumarBonoAPago, restarBonoDePago } from '../lib/bonosCalculo'
import { Panel, Button, Input } from './ui'
import MoneyInput from './MoneyInput'

const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const lbl = { color: 'var(--text-muted)' }
const FALTA_MIGRACION = 'Falta ejecutar la migración 86 en Supabase (bonos con cálculo).'
const errMig = (m) => (/bonus_plans|bonus_calculos|calculo_id/.test(m || '') ? FALTA_MIGRACION : m)

const PLAN_VACIO = { id: null, nombre: '', periodicidad: 'quincenal', escalones: [{ desde: '', tipo: 'fijo', valor: '' }], dia_pago_1: 16, dia_pago_2: 1, cuentas: null, nota: '' }

// =====================================================================================
// BONOS CON CÁLCULO: cada bono es un cuadro independiente donde se escribe lo facturado por cada chatter en el periodo,
// se calcula lo que le toca según los escalones y se envía solo al cuadro general como un bono con su fecha de pago.
// =====================================================================================
export default function BonosCalculados({ area = 'chatting', cuentas, bonos, pagos, onCambio }) {
  const { profile } = useAuth()
  const [planes, setPlanes] = useState([])
  const [calculos, setCalculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null)   // plan en edición / creación
  const [msg, setMsg] = useState('')

  async function cargar() {
    const { data: ps, error: e1 } = await supabase.from('bonus_plans').select('*').order('created_at')
    if (e1) { setErr(errMig(e1.message)); setLoading(false); return }
    const propios = (ps || []).filter((p) => (p.area || 'chatting') === area)
    const { data: cs, error: e2 } = await supabase.from('bonus_calculos').select('*').limit(10000)
    if (e2) { setErr(errMig(e2.message)); setLoading(false); return }
    const ids = new Set(propios.map((p) => p.id))
    setErr(''); setPlanes(propios); setCalculos((cs || []).filter((c) => ids.has(c.plan_id))); setLoading(false)
  }
  useEffect(() => { cargar() }, [area])

  async function recargarTodo() { await cargar(); if (onCambio) await onCambio() }

  // ---------- crear / editar el bono ----------
  async function guardarPlan(e) {
    e.preventDefault(); setErr('')
    const es = escalonesOrdenados(form.escalones)
    if (!form.nombre.trim()) { setErr('Ponle un nombre al bono.'); return }
    if (!es.length) { setErr('Añade al menos un escalón con la facturación mínima y lo que se paga.'); return }
    if (new Set(es.map((x) => x.desde)).size !== es.length) { setErr('Hay dos escalones con la misma facturación mínima.'); return }
    const payload = {
      area, nombre: form.nombre.trim(), periodicidad: form.periodicidad, escalones: es,
      dia_pago_1: Math.min(31, Math.max(1, Math.round(num(form.dia_pago_1)) || 1)), dia_pago_2: Math.min(31, Math.max(1, Math.round(num(form.dia_pago_2)) || 1)),
      cuentas: form.cuentas && form.cuentas.length ? form.cuentas : null, nota: form.nota?.trim() || null,
    }
    const r = form.id
      ? await supabase.from('bonus_plans').update(payload).eq('id', form.id)
      : await supabase.from('bonus_plans').insert([{ ...payload, created_by: profile?.id || null }])
    if (r.error) { setErr(errMig(r.error.message)); return }
    setForm(null); setMsg(form.id ? 'Bono actualizado. Los cálculos ya guardados no cambian hasta que vuelvas a guardar la facturación de cada chatter.' : '✓ Bono creado.')
    await cargar()
  }

  async function borrarPlan(p) {
    const suyos = calculos.filter((c) => c.plan_id === p.id)
    if (!confirm(`¿Eliminar el bono «${p.nombre}»?\n\nSe borrarán sus ${suyos.length} cálculo(s) y los bonos que envió al cuadro general (se restan de los pagos donde ya estaban sumados).`)) return
    for (const c of suyos) {
      const { data } = await supabase.from('payout_bonuses').select('*').eq('calculo_id', c.id)
      for (const b of (data || []).filter((x) => x.calculo_id === c.id)) await restarBonoDePago(b)
    }
    const { error } = await supabase.from('bonus_plans').delete().eq('id', p.id)
    if (error) { setErr(errMig(error.message)); return }
    setMsg('Bono eliminado.'); await recargarTodo()
  }

  if (loading) return <p className="text-sm" style={lbl}>Cargando…</p>

  return (
    <div>
      {err && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{msg}</p>}

      {!form && err !== FALTA_MIGRACION && (
        <div className="mb-4"><Button onClick={() => { setMsg(''); setErr(''); setForm({ ...PLAN_VACIO, escalones: [{ desde: '', tipo: 'fijo', valor: '' }] }) }}>+ Crear bono con cálculo</Button></div>
      )}
      {form && <FormPlan form={form} setForm={setForm} cuentas={cuentas} onSubmit={guardarPlan} onCancel={() => { setForm(null); setErr('') }} />}

      {planes.length === 0 && !form && !err && (
        <Panel className="p-6 text-sm text-center" style={lbl}>Todavía no hay bonos con cálculo. Crea uno: eliges si es mensual o quincenal, defines los escalones (cuánto se paga al facturar tal cantidad) y su fecha de pago. Después solo tienes que escribir lo facturado por cada chatter.</Panel>
      )}

      {planes.map((p) => (
        <PlanCard key={p.id} plan={p} cuentas={cuentas} calculos={calculos.filter((c) => c.plan_id === p.id)} bonos={bonos} pagos={pagos}
          onEditar={() => { setMsg(''); setErr(''); setForm({ ...p, escalones: p.escalones.map((e) => ({ ...e })), cuentas: p.cuentas || null }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onEliminar={() => borrarPlan(p)} onCambio={recargarTodo} setMsg={setMsg} setErr={setErr} />
      ))}
    </div>
  )
}

// ---------- formulario de bono ----------
function FormPlan({ form, setForm, cuentas, onSubmit, onCancel }) {
  const activas = cuentas.filter((c) => c.activa !== false)
  const set = (k, v) => setForm({ ...form, [k]: v })
  const setEsc = (i, k, v) => set('escalones', form.escalones.map((e, j) => (j === i ? { ...e, [k]: v } : e)))
  const todos = !form.cuentas
  const selTodos = (on) => set('cuentas', on ? null : activas.map((c) => c.id))
  const toggle = (id) => set('cuentas', (form.cuentas || []).includes(id) ? form.cuentas.filter((x) => x !== id) : [...(form.cuentas || []), id])
  const q = form.periodicidad === 'quincenal'
  return (
    <Panel className="p-5 mb-5">
      <p className="text-sm font-medium mb-3">{form.id ? 'Editar bono' : 'Nuevo bono con cálculo'}</p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div><label className="text-xs block mb-1" style={lbl}>Nombre del bono</label><Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Bono de facturación, Meta del mes…" required /></div>
          <div>
            <label className="text-xs block mb-1" style={lbl}>¿Cada cuánto se calcula?</label>
            <div className="flex gap-2">
              {[['quincenal', 'Quincenal (1–15 y 16–fin)'], ['mensual', 'Mensual']].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, periodicidad: k, dia_pago_1: k === 'quincenal' ? 16 : 1, dia_pago_2: 1 })} className="px-3 py-2 rounded-md text-sm flex-1"
                  style={{ background: form.periodicidad === k ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${form.periodicidad === k ? 'var(--accent)' : 'var(--border)'}`, color: form.periodicidad === k ? 'var(--accent)' : 'var(--text)' }}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>Condiciones: cuánto se paga según lo facturado</p>
        <p className="text-xs mb-2" style={lbl}>Se paga el escalón más alto que alcance el chatter (no se suman). El importe puede ser fijo o un % de lo facturado.</p>
        <div className="space-y-2 mb-2">
          {form.escalones.map((e, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
              <span className="text-sm">Si factura desde</span>
              <div className="w-32"><MoneyInput value={e.desde} onChange={(ev) => setEsc(i, 'desde', ev.target.value)} placeholder="$ 1,000" /></div>
              <span className="text-sm">se le paga</span>
              <select value={e.tipo} onChange={(ev) => setEsc(i, 'tipo', ev.target.value)} className="rounded px-2 py-2 text-sm" style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="fijo">un importe fijo ($)</option>
                <option value="pct">un % de lo facturado</option>
              </select>
              <div className="w-28"><MoneyInput value={e.valor} onChange={(ev) => setEsc(i, 'valor', ev.target.value)} placeholder={e.tipo === 'pct' ? '3 %' : '$ 20'} /></div>
              {form.escalones.length > 1 && <button type="button" className="text-xs ml-auto" style={{ color: 'var(--danger)' }} onClick={() => set('escalones', form.escalones.filter((_, j) => j !== i))}>✕ Quitar</button>}
            </div>
          ))}
        </div>
        <button type="button" className="text-xs underline mb-4" style={{ color: 'var(--accent)' }} onClick={() => set('escalones', [...form.escalones, { desde: '', tipo: 'fijo', valor: '' }])}>+ Añadir otro escalón</button>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1 mt-2" style={{ color: 'var(--accent)' }}>Fecha de pago</p>
        <div className="flex flex-wrap items-center gap-2 text-sm mb-1">
          {q ? (<>
            <span>1ª quincena (1–15): se paga el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_1} onChange={(e) => set('dia_pago_1', e.target.value)} /></div><span>del mismo mes ·</span>
            <span>2ª quincena (16–fin): el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_2} onChange={(e) => set('dia_pago_2', e.target.value)} /></div><span>del mes siguiente</span>
          </>) : (<>
            <span>Se paga el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_1} onChange={(e) => set('dia_pago_1', e.target.value)} /></div><span>del mes siguiente</span>
          </>)}
        </div>
        <p className="text-xs mb-4" style={lbl}>Esa es la fecha por defecto: en cada cálculo la puedes cambiar. El bono aparece en el cuadro general en esa fecha.</p>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>¿A quién aplica?</p>
        <label className="flex items-center gap-2 text-sm mb-2"><input type="checkbox" checked={todos} onChange={(e) => selTodos(e.target.checked)} /> Todos los activos</label>
        {!todos && (
          <div className="flex flex-wrap gap-2 mb-3">
            {activas.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full cursor-pointer" style={{ background: (form.cuentas || []).includes(c.id) ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <input type="checkbox" checked={(form.cuentas || []).includes(c.id)} onChange={() => toggle(c.id)} />{c.nombre}
              </label>
            ))}
          </div>
        )}
        <div className="mb-4"><label className="text-xs block mb-1" style={lbl}>Nota (opcional)</label><Input value={form.nota || ''} onChange={(e) => set('nota', e.target.value)} /></div>
        <div className="flex gap-2"><Button type="submit">{form.id ? 'Guardar cambios' : 'Crear bono'}</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button></div>
      </form>
    </Panel>
  )
}

// ---------- cuadro independiente de un bono ----------
function PlanCard({ plan, cuentas, calculos, bonos, pagos, onEditar, onEliminar, onCambio, setMsg, setErr }) {
  const periodos = useMemo(() => periodosBono(plan.periodicidad, undefined, 8), [plan.periodicidad])
  const [clave, setClave] = useState(() => (periodos[1] || periodos[0]).clave)   // por defecto, el último periodo ya terminado
  const periodo = periodos.find((x) => x.clave === clave) || periodos[0]
  const [local, setLocal] = useState({})      // ediciones sin guardar: { cuentaId: { fact, fecha } }
  const [guardando, setGuardando] = useState({})
  const activas = cuentas.filter((c) => c.activa !== false)
  const filas = (plan.cuentas ? activas.filter((c) => plan.cuentas.includes(c.id)) : activas)
  const fechaDef = fechaPagoPeriodo(plan, periodo)
  useEffect(() => { setLocal({}) }, [clave])

  const calcDe = (cid) => calculos.find((c) => c.account_id === cid && c.periodo_desde === periodo.desde)
  const valores = (c) => {
    const calc = calcDe(c.id); const l = local[c.id] || {}
    return { fact: l.fact ?? (calc ? fmtNum(calc.facturado) : ''), fecha: l.fecha ?? (calc?.fecha_pago || fechaDef) }
  }

  async function guardarFila(c, factTxt, fecha) {
    const prev = calcDe(c.id)
    const fact = num(factTxt)
    setGuardando((g) => ({ ...g, [c.id]: true })); setErr('')
    try {
      if (!(fact > 0)) { if (prev) await quitar(prev); return }
      const { monto, idx, escalon } = calcularBono(plan.escalones, fact)
      const fila = { plan_id: plan.id, account_id: c.id, periodo_desde: periodo.desde, periodo_hasta: periodo.hasta, facturado: fact, escalon_idx: idx, monto, fecha_pago: fecha || fechaDef, updated_at: new Date().toISOString() }
      const { data: calc, error } = await supabase.from('bonus_calculos').upsert(fila, { onConflict: 'plan_id,account_id,periodo_desde' }).select().single()
      if (error) throw new Error(errMig(error.message))
      // el bono enviado al cuadro general: se retira del pago anterior (si estaba sumado) y se vuelve a enviar con los datos nuevos
      const { data: ex } = await supabase.from('payout_bonuses').select('*').eq('calculo_id', calc.id)
      const b = (ex || []).find((x) => x.calculo_id === calc.id)
      if (b?.aplicado_en) await restarBonoDePago(b)
      if (!(calc.monto > 0)) {
        if (b) await supabase.from('payout_bonuses').delete().eq('id', b.id)
        setMsg(`${c.nombre}: con ${money(fact)} no llega a ningún escalón, no hay bono.`)
      } else {
        const datos = { account_id: c.id, nombre: `${plan.nombre} · ${periodo.etiqueta}`, monto: calc.monto, fecha_cobro: calc.fecha_pago, calculo_id: calc.id, aplicado_en: null,
          nota: `Facturó ${money(fact)} → escalón ${idx} (${textoEscalon(escalon)})` }
        let nuevo
        if (b) { const r = await supabase.from('payout_bonuses').update(datos).eq('id', b.id); if (r.error) throw new Error(errMig(r.error.message)); nuevo = { ...b, ...datos } }
        else { const r = await supabase.from('payout_bonuses').insert([datos]).select().single(); if (r.error) throw new Error(errMig(r.error.message)); nuevo = r.data }
        const s = await sumarBonoAPago({ ...nuevo, account_id: c.id })
        setMsg(`✓ ${c.nombre}: bono de ${money(calc.monto)} enviado al cuadro general (cobro ${fmtF(calc.fecha_pago)})${s.ok ? ' y sumado al pago de esa fecha' : ''}.${s.pagado ? ' Ese pago ya estaba marcado como Pagado: revisa que el extra se abone.' : ''}`)
      }
    } catch (e) { setErr(e.message) } finally {
      setLocal((l) => { const { [c.id]: _x, ...resto } = l; return resto })
      setGuardando((g) => ({ ...g, [c.id]: false }))
      await onCambio()
    }
  }
  async function quitar(calc) {
    const { data } = await supabase.from('payout_bonuses').select('*').eq('calculo_id', calc.id)
    for (const b of (data || []).filter((x) => x.calculo_id === calc.id)) await restarBonoDePago(b)
    await supabase.from('bonus_calculos').delete().eq('id', calc.id)
    setMsg('Cálculo quitado: el bono ya no aparece en el cuadro general.')
  }

  const totalPeriodo = filas.reduce((t, c) => t + (calcDe(c.id)?.monto || 0), 0)
  const th = (t) => <th key={t} className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap" style={lbl}>{t}</th>

  return (
    <Panel className="mb-5">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="font-medium">{plan.nombre} <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{plan.periodicidad === 'mensual' ? 'Mensual' : 'Quincenal'}</span></p>
          <p className="text-xs mt-1" style={lbl}>{resumenEscalones(plan.escalones)}</p>
          <p className="text-xs" style={lbl}>{plan.cuentas ? `Aplica a ${filas.length} chatter(s)` : 'Aplica a todos los activos'}{plan.nota ? ` · ${plan.nota}` : ''}</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={onEditar} className="hover:underline" style={{ color: 'var(--accent)' }}>Editar bono</button>
          <button onClick={onEliminar} style={{ color: 'var(--danger)' }}>Eliminar</button>
        </div>
      </div>
      <div className="p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs" style={lbl}>Periodo</label>
        <select value={clave} onChange={(e) => setClave(e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {periodos.map((x) => <option key={x.clave} value={x.clave}>{x.etiqueta}{x.enCurso ? ' · en curso' : ''}</option>)}
        </select>
        <span className="text-xs" style={lbl}>Fecha de pago por defecto: <strong style={{ color: 'var(--text)' }}>{fmtF(fechaDef)}</strong></span>
        <span className="ml-auto text-sm" style={lbl}>Total de bonos de este periodo: <strong className="gold-text">{money(totalPeriodo)}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Chatter', 'Facturado en el periodo ($)', 'Escalón', 'Bono', 'Fecha de pago', 'Estado'].map(th)}</tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-sm" style={lbl}>No hay chatters en este bono.</td></tr>}
            {filas.map((c) => {
              const v = valores(c); const calc = calcDe(c.id)
              const vivo = calcularBono(plan.escalones, v.fact)
              const b = calc ? bonos.find((x) => x.calculo_id === calc.id) : null
              const pago = b?.aplicado_en ? pagos.find((p) => p.id === b.aplicado_en) : null
              const sinGuardar = !!local[c.id]
              const estado = guardando[c.id] ? 'Guardando…'
                : sinGuardar ? 'Sin guardar (sal del campo para guardar)'
                : !calc ? '—'
                : !(calc.monto > 0) ? 'No llega a ningún escalón'
                : pago ? `✓ Sumado al pago del ${fmtF(pago.fecha)}${pago.estado === 'Pagado' ? ' (pagado)' : ''}`
                : b ? `✓ En el cuadro general · se suma al pago del ${fmtF(calc.fecha_pago)}`
                : 'Falta enviarlo: vuelve a guardar la fila'
              const ok = !sinGuardar && calc && calc.monto > 0 && b
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap">{c.nombre}</td>
                  <td className="px-3 py-2"><div className="w-40"><MoneyInput value={v.fact} placeholder="$ 0.00"
                    onChange={(e) => setLocal((l) => ({ ...l, [c.id]: { ...(l[c.id] || {}), fact: e.target.value, fecha: (l[c.id] || {}).fecha } }))}
                    onBlur={() => { if (local[c.id]) guardarFila(c, local[c.id].fact ?? v.fact, local[c.id].fecha ?? v.fecha) }} /></div></td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap" style={lbl}>{vivo.escalon ? `${vivo.idx} · ${textoEscalon(vivo.escalon)}` : '—'}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold gold-text whitespace-nowrap">{vivo.monto > 0 ? money(vivo.monto) : <span style={lbl}>—</span>}</td>
                  <td className="px-3 py-2"><div className="w-36"><Input type="date" value={v.fecha}
                    onChange={(e) => { const f = e.target.value; setLocal((l) => ({ ...l, [c.id]: { ...(l[c.id] || {}), fecha: f, fact: (l[c.id] || {}).fact ?? v.fact } })); if (num(v.fact) > 0 && f) guardarFila(c, local[c.id]?.fact ?? v.fact, f) }} /></div></td>
                  <td className="px-3 py-2 text-xs" style={{ color: ok ? 'var(--success)' : 'var(--text-muted)' }}>
                    {estado}
                    {calc && !guardando[c.id] && <button className="ml-2 underline" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`¿Quitar el cálculo de ${c.nombre}? El bono dejará de aparecer en el cuadro general.`)) quitar(calc).then(onCambio) }}>quitar</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs" style={lbl}>Escribe lo facturado y sal del campo: el bono se calcula y se envía solo al cuadro general con su fecha de pago. Si ese día ya hay un pago registrado, se suma automáticamente.</p>
    </Panel>
  )
}
