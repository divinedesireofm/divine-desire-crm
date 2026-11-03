import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { num, fmtNum } from '../lib/numeros'
import {
  OPERADORES, TIPOS_PAGO, CAMPO_FACTURADO, camposDePlan, reglasDePlan, modoDePlan, primerCampoDinero, condicionValida,
  calcularPlan, textoRegla, resumenPlan, periodosBono, fechaPagoPeriodo, sumarBonoAPago, restarBonoDePago,
} from '../lib/bonosCalculo'
import { Panel, Button, Input } from './ui'
import MoneyInput from './MoneyInput'

const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const lbl = { color: 'var(--text-muted)' }
const selStyle = { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }
const FALTA_MIGRACION = 'Falta ejecutar la migración 86 y la 87 en Supabase (bonos con cálculo).'
const errMig = (m) => (/bonus_plans|bonus_calculos|calculo_id|campos|reglas|modo_reglas|tope|datos|detalle/.test(m || '') ? FALTA_MIGRACION : m)
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'r' + Math.random().toString(36).slice(2, 10))
const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)

const condVacia = (campo) => ({ campo, op: '>=', valor: '', valor2: '' })
const reglaVacia = (campo) => ({ id: uid(), nombre: '', union: 'y', condiciones: [condVacia(campo)], pago: { tipo: 'fijo', valor: '', campo, desde: '', cada: '' } })
const PLAN_VACIO = () => ({ id: null, nombre: '', periodicidad: 'quincenal', campos: [{ ...CAMPO_FACTURADO }], reglas: [reglaVacia('facturado')], modo_reglas: 'primera', tope: '', dia_pago_1: 16, dia_pago_2: 1, cuentas: null, nota: '' })

// Convierte un bono guardado (incluidos los de escalones del lote 93) en el estado editable del formulario
function formDePlan(p) {
  const campos = camposDePlan(p).map((c) => ({ ...c }))
  const reglas = reglasDePlan(p).map((r) => ({
    id: r.id || uid(), nombre: r.nombre || '', union: r.union === 'o' ? 'o' : 'y',
    condiciones: (r.condiciones || []).map((c) => ({ campo: c.campo, op: c.op, valor: c.valor ?? '', valor2: c.valor2 ?? '' })),
    pago: { tipo: r.pago?.tipo || 'fijo', valor: r.pago?.valor ?? '', campo: r.pago?.campo || primerCampoDinero(campos), desde: r.pago?.desde ?? '', cada: r.pago?.cada ?? '' },
  }))
  return { ...p, campos, reglas, modo_reglas: modoDePlan(p), tope: p.tope ?? '', cuentas: p.cuentas || null }
}

// =====================================================================================
// BONOS CON CÁLCULO: cada bono es un cuadro independiente con SUS datos y SUS reglas (las defines tú).
// Se escribe lo de cada chatter en el periodo, se calcula lo que le toca y se envía solo al cuadro general.
// =====================================================================================
export default function BonosCalculados({ area = 'chatting', cuentas, bonos, pagos, onCambio }) {
  const { profile } = useAuth()
  const [planes, setPlanes] = useState([])
  const [calculos, setCalculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null)
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

  async function guardarPlan(e) {
    e.preventDefault(); setErr('')
    // ----- datos a introducir
    const usados = new Set(); const campos = []
    for (const c of form.campos) {
      const nombre = c.nombre.trim(); if (!nombre) { setErr('Todos los datos necesitan un nombre (por ejemplo «Facturado ($)» u «Horas»).'); return }
      let id = c.id || slug(nombre) || 'dato'; let n = 2; const base = id
      while (usados.has(id)) { id = `${base}_${n++}` }
      usados.add(id); campos.push({ id, nombre, tipo: c.tipo === 'numero' ? 'numero' : 'dinero' })
    }
    // el id de un dato existente no cambia al renombrarlo; las reglas se re-enlazan por posición si el id es nuevo
    const idPorOriginal = new Map(form.campos.map((c, i) => [c.id, campos[i].id]))
    const reID = (id) => idPorOriginal.get(id) ?? id
    const idsValidos = new Set(campos.map((c) => c.id))
    // ----- reglas
    const reglas = []
    for (let i = 0; i < form.reglas.length; i++) {
      const r = form.reglas[i]; const nom = r.nombre.trim() || `Regla ${i + 1}`
      const conds = r.condiciones.map((c) => ({ campo: reID(c.campo), op: c.op, valor: c.valor === '' ? '' : num(c.valor), valor2: c.op === 'entre' ? (c.valor2 === '' ? '' : num(c.valor2)) : null }))
      if (conds.some((c) => !idsValidos.has(c.campo) || !condicionValida(c))) { setErr(`${nom}: hay una condición incompleta (elige dato, comparación y valor) o usa un dato que ya no existe.`); return }
      const p = r.pago; const campoPago = reID(p.campo) || primerCampoDinero(campos)
      if (!(num(p.valor) > 0)) { setErr(`${nom}: indica cuánto se paga.`); return }
      if (['pct', 'pct_exceso', 'por_cada'].includes(p.tipo) && !idsValidos.has(campoPago)) { setErr(`${nom}: el dato del que se calcula el pago ya no existe.`); return }
      if (p.tipo === 'por_cada' && !(num(p.cada) > 0)) { setErr(`${nom}: indica cada cuánto se paga (por ejemplo, por cada 500).`); return }
      reglas.push({ id: r.id, nombre: r.nombre.trim(), union: r.union, condiciones: conds, pago: { tipo: p.tipo, valor: num(p.valor), campo: campoPago, desde: num(p.desde), cada: num(p.cada) } })
    }
    if (!form.nombre.trim()) { setErr('Ponle un nombre al bono.'); return }
    if (!reglas.length) { setErr('Añade al menos una regla.'); return }
    const payload = {
      area, nombre: form.nombre.trim(), periodicidad: form.periodicidad, campos, reglas, modo_reglas: form.modo_reglas === 'sumar' ? 'sumar' : 'primera',
      tope: num(form.tope) > 0 ? num(form.tope) : null, escalones: [],
      dia_pago_1: Math.min(31, Math.max(1, Math.round(num(form.dia_pago_1)) || 1)), dia_pago_2: Math.min(31, Math.max(1, Math.round(num(form.dia_pago_2)) || 1)),
      cuentas: form.cuentas && form.cuentas.length ? form.cuentas : null, nota: form.nota?.trim() || null,
    }
    const r = form.id
      ? await supabase.from('bonus_plans').update(payload).eq('id', form.id)
      : await supabase.from('bonus_plans').insert([{ ...payload, created_by: profile?.id || null }])
    if (r.error) { setErr(errMig(r.error.message)); return }
    setForm(null); setMsg(form.id ? 'Bono actualizado. Los cálculos ya guardados no cambian hasta que vuelvas a guardar los datos de cada chatter.' : '✓ Bono creado.')
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
        <div className="mb-4"><Button onClick={() => { setMsg(''); setErr(''); setForm(PLAN_VACIO()) }}>+ Crear bono con cálculo</Button></div>
      )}
      {form && <FormPlan form={form} setForm={setForm} cuentas={cuentas} onSubmit={guardarPlan} onCancel={() => { setForm(null); setErr('') }} />}
      {planes.length === 0 && !form && !err && (
        <Panel className="p-6 text-sm text-center" style={lbl}>Todavía no hay bonos con cálculo. Crea uno: decides qué datos introduces de cada chatter (facturado, horas…), las condiciones que quieras y cuánto se paga en cada caso. Después solo escribes los datos de cada chatter y el bono se calcula y llega solo al cuadro general.</Panel>
      )}
      {planes.map((p) => (
        <PlanCard key={p.id} plan={p} cuentas={cuentas} calculos={calculos.filter((c) => c.plan_id === p.id)} bonos={bonos} pagos={pagos}
          onEditar={() => { setMsg(''); setErr(''); setForm(formDePlan(p)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onEliminar={() => borrarPlan(p)} onCambio={recargarTodo} setMsg={setMsg} setErr={setErr} />
      ))}
    </div>
  )
}

// ---------- editor de una regla ----------
function ReglaEditor({ r, i, total, campos, setR, mover, quitar }) {
  const setCond = (j, k, v) => setR({ ...r, condiciones: r.condiciones.map((c, n) => (n === j ? { ...c, [k]: v } : c)) })
  const setPago = (k, v) => setR({ ...r, pago: { ...r.pago, [k]: v } })
  const campoSel = (valor, onChange) => (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-2 text-sm" style={selStyle}>
      {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre || '(sin nombre)'}</option>)}
    </select>
  )
  const tipoCampo = (id) => campos.find((c) => c.id === id)?.tipo
  const ph = (id) => (tipoCampo(id) === 'dinero' ? '$ 1,000' : '30')
  const p = r.pago
  return (
    <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Regla {i + 1}</span>
        <input value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} placeholder="Nombre (opcional)" className="rounded px-2 py-1 text-sm flex-1 max-w-xs" style={selStyle} />
        <span className="ml-auto flex items-center gap-2 text-xs">
          <button type="button" disabled={i === 0} onClick={() => mover(-1)} title="Subir" className="px-1.5" style={{ opacity: i === 0 ? 0.3 : 1 }}>▲</button>
          <button type="button" disabled={i === total - 1} onClick={() => mover(1)} title="Bajar" className="px-1.5" style={{ opacity: i === total - 1 ? 0.3 : 1 }}>▼</button>
          {total > 1 && <button type="button" onClick={quitar} style={{ color: 'var(--danger)' }}>✕ Quitar regla</button>}
        </span>
      </div>

      <p className="text-xs mb-1" style={lbl}>{r.condiciones.length ? 'SI se cumple…' : 'Sin condiciones: esta regla se aplica siempre (por ejemplo, un bono base).'}</p>
      {r.condiciones.map((c, j) => (
        <div key={j} className="flex flex-wrap items-center gap-2 mb-2">
          {j > 0 && <span className="text-xs w-6" style={{ color: 'var(--accent)' }}>{r.union === 'o' ? 'O' : 'Y'}</span>}
          {j === 0 && r.condiciones.length > 1 && <span className="w-6" />}
          {campoSel(c.campo, (v) => setCond(j, 'campo', v))}
          <select value={c.op} onChange={(e) => setCond(j, 'op', e.target.value)} className="rounded px-2 py-2 text-sm" style={selStyle}>
            {OPERADORES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <div className="w-28"><MoneyInput value={c.valor} onChange={(e) => setCond(j, 'valor', e.target.value)} placeholder={ph(c.campo)} /></div>
          {c.op === 'entre' && (<><span className="text-xs">y</span><div className="w-28"><MoneyInput value={c.valor2} onChange={(e) => setCond(j, 'valor2', e.target.value)} placeholder={ph(c.campo)} /></div></>)}
          <button type="button" className="text-xs" style={{ color: 'var(--danger)' }} onClick={() => setR({ ...r, condiciones: r.condiciones.filter((_, n) => n !== j) })}>✕</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button type="button" className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => setR({ ...r, condiciones: [...r.condiciones, condVacia(campos[0]?.id)] })}>+ Añadir condición</button>
        {r.condiciones.length > 1 && (
          <span className="text-xs" style={lbl}>La regla se cumple cuando se cumplen{' '}
            <select value={r.union} onChange={(e) => setR({ ...r, union: e.target.value })} className="rounded px-1.5 py-1 text-xs" style={selStyle}>
              <option value="y">todas las condiciones (Y)</option><option value="o">alguna de las condiciones (O)</option>
            </select>
          </span>
        )}
      </div>

      <p className="text-xs mb-1" style={lbl}>ENTONCES se paga…</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={p.tipo} onChange={(e) => setPago('tipo', e.target.value)} className="rounded px-2 py-2 text-sm" style={selStyle}>
          {TIPOS_PAGO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <div className="w-28"><MoneyInput value={p.valor} onChange={(e) => setPago('valor', e.target.value)} placeholder={p.tipo === 'fijo' || p.tipo === 'por_cada' ? '$ 20' : '3 %'} /></div>
        {p.tipo === 'pct' && (<><span className="text-sm">de</span>{campoSel(p.campo, (v) => setPago('campo', v))}</>)}
        {p.tipo === 'pct_exceso' && (<><span className="text-sm">de lo que</span>{campoSel(p.campo, (v) => setPago('campo', v))}<span className="text-sm">pase de</span><div className="w-28"><MoneyInput value={p.desde} onChange={(e) => setPago('desde', e.target.value)} placeholder="3,000" /></div></>)}
        {p.tipo === 'por_cada' && (<><span className="text-sm">por cada</span><div className="w-24"><MoneyInput value={p.cada} onChange={(e) => setPago('cada', e.target.value)} placeholder="500" /></div><span className="text-sm">de</span>{campoSel(p.campo, (v) => setPago('campo', v))}<span className="text-xs" style={lbl}>contando desde</span><div className="w-24"><MoneyInput value={p.desde} onChange={(e) => setPago('desde', e.target.value)} placeholder="0" /></div></>)}
      </div>
    </div>
  )
}

// ---------- formulario de bono ----------
function FormPlan({ form, setForm, cuentas, onSubmit, onCancel }) {
  const activas = cuentas.filter((c) => c.activa !== false)
  const set = (k, v) => setForm({ ...form, [k]: v })
  const todos = !form.cuentas
  const selTodos = (on) => set('cuentas', on ? null : activas.map((c) => c.id))
  const toggle = (id) => set('cuentas', (form.cuentas || []).includes(id) ? form.cuentas.filter((x) => x !== id) : [...(form.cuentas || []), id])
  const q = form.periodicidad === 'quincenal'
  const camposPrev = form.campos.map((c) => ({ ...c, id: c.id || slug(c.nombre) || 'dato' }))
  const [prueba, setPrueba] = useState({})

  // simulador con las reglas tal como están en el formulario
  const simulacion = useMemo(() => {
    const planTmp = {
      campos: camposPrev, modo_reglas: form.modo_reglas, tope: num(form.tope),
      reglas: form.reglas.map((r) => ({ ...r, condiciones: r.condiciones.map((c) => ({ ...c, valor: c.valor === '' ? '' : num(c.valor), valor2: c.valor2 === '' ? '' : num(c.valor2) })), pago: { ...r.pago, valor: num(r.pago.valor), desde: num(r.pago.desde), cada: num(r.pago.cada), campo: r.pago.campo || primerCampoDinero(camposPrev) } })),
    }
    const datos = Object.fromEntries(camposPrev.map((c) => [c.id, num(prueba[c.id])]))
    return calcularPlan(planTmp, datos)
  }, [form, prueba])

  return (
    <Panel className="p-5 mb-5">
      <p className="text-sm font-medium mb-3">{form.id ? 'Editar bono' : 'Nuevo bono con cálculo'}</p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
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

        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>1 · Datos que vas a escribir de cada chatter</p>
        <p className="text-xs mb-2" style={lbl}>Lo que necesites para decidir el bono: lo facturado, horas trabajadas, ventas de PPV, mensajes… Cada dato será una columna en la tabla de cálculo.</p>
        <div className="space-y-2 mb-2">
          {form.campos.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={c.nombre} onChange={(e) => set('campos', form.campos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre del dato (Facturado, Horas…)" className="rounded px-3 py-2 text-sm w-64" style={selStyle} />
              <select value={c.tipo} onChange={(e) => set('campos', form.campos.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))} className="rounded px-2 py-2 text-sm" style={selStyle}>
                <option value="dinero">Dinero ($)</option><option value="numero">Número (horas, mensajes…)</option>
              </select>
              {form.campos.length > 1 && <button type="button" className="text-xs" style={{ color: 'var(--danger)' }} onClick={() => set('campos', form.campos.filter((_, j) => j !== i))}>✕ Quitar</button>}
            </div>
          ))}
        </div>
        <button type="button" className="text-xs underline mb-5" style={{ color: 'var(--accent)' }} onClick={() => set('campos', [...form.campos, { id: '', nombre: '', tipo: 'numero' }])}>+ Añadir otro dato</button>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1 mt-2" style={{ color: 'var(--accent)' }}>2 · Reglas: tus condiciones y cuánto se paga</p>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <span>Cuando se cumplan varias reglas:</span>
          {[['primera', 'pagar solo la primera que se cumpla (de arriba abajo)'], ['sumar', 'sumar todas las que se cumplan']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => set('modo_reglas', k)} className="px-3 py-1.5 rounded-md text-xs"
              style={{ background: form.modo_reglas === k ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${form.modo_reglas === k ? 'var(--accent)' : 'var(--border)'}`, color: form.modo_reglas === k ? 'var(--accent)' : 'var(--text)' }}>{t}</button>
          ))}
        </div>
        {form.reglas.map((r, i) => (
          <ReglaEditor key={r.id} r={r} i={i} total={form.reglas.length} campos={camposPrev}
            setR={(nr) => set('reglas', form.reglas.map((x, j) => (j === i ? nr : x)))}
            mover={(d) => { const a = [...form.reglas]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); set('reglas', a) }}
            quitar={() => set('reglas', form.reglas.filter((_, j) => j !== i))} />
        ))}
        <button type="button" className="text-xs underline mb-3" style={{ color: 'var(--accent)' }} onClick={() => set('reglas', [...form.reglas, reglaVacia(camposPrev[0]?.id)])}>+ Añadir otra regla</button>
        <div className="flex flex-wrap items-center gap-2 mb-5 text-sm">
          <span>Máximo que se puede pagar a un chatter (opcional):</span><div className="w-32"><MoneyInput value={form.tope} onChange={(e) => set('tope', e.target.value)} placeholder="sin límite" /></div>
        </div>

        <div className="rounded-lg p-3 mb-5" style={{ background: 'var(--panel-alt)', border: '1px dashed var(--accent)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>Probar el bono</p>
          <div className="flex flex-wrap items-end gap-3">
            {camposPrev.map((c) => (
              <div key={c.id}><label className="text-xs block mb-1" style={lbl}>{c.nombre || '(sin nombre)'}</label><div className="w-32"><MoneyInput value={prueba[c.id] ?? ''} onChange={(e) => setPrueba({ ...prueba, [c.id]: e.target.value })} placeholder="0" /></div></div>
            ))}
            <div className="text-sm">Bono: <strong className="gold-text">{money(simulacion.monto)}</strong>
              <span className="block text-xs" style={lbl}>{simulacion.aplicadas.length ? simulacion.aplicadas.map((a) => `${a.nombre} ${money(a.monto)}`).join(' + ') + (simulacion.topado ? ' (limitado al máximo)' : '') : 'Ninguna regla se cumple'}</span></div>
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>3 · Fecha de pago</p>
        <div className="flex flex-wrap items-center gap-2 text-sm mb-1">
          {q ? (<>
            <span>1ª quincena (1–15): se paga el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_1} onChange={(e) => set('dia_pago_1', e.target.value)} /></div><span>del mismo mes ·</span>
            <span>2ª quincena (16–fin): el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_2} onChange={(e) => set('dia_pago_2', e.target.value)} /></div><span>del mes siguiente</span>
          </>) : (<>
            <span>Se paga el día</span><div className="w-16"><Input type="number" min="1" max="31" value={form.dia_pago_1} onChange={(e) => set('dia_pago_1', e.target.value)} /></div><span>del mes siguiente</span>
          </>)}
        </div>
        <p className="text-xs mb-5" style={lbl}>Esa es la fecha por defecto: en cada cálculo la puedes cambiar. El bono aparece en el cuadro general en esa fecha.</p>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>4 · ¿A quién aplica?</p>
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
  const [local, setLocal] = useState({})      // ediciones sin guardar: { cuentaId: { datos: {campo: texto}, fecha } }
  const [guardando, setGuardando] = useState({})
  const campos = camposDePlan(plan)
  const activas = cuentas.filter((c) => c.activa !== false)
  const filas = (plan.cuentas ? activas.filter((c) => plan.cuentas.includes(c.id)) : activas)
  const fechaDef = fechaPagoPeriodo(plan, periodo)
  useEffect(() => { setLocal({}) }, [clave])

  const calcDe = (cid) => calculos.find((c) => c.account_id === cid && c.periodo_desde === periodo.desde)
  const texto = (campo, v) => (v === null || v === undefined || v === '' ? '' : campo.tipo === 'dinero' ? fmtNum(v) : String(v))
  const valores = (c) => {
    const calc = calcDe(c.id); const l = local[c.id] || {}
    const base = calc?.datos || (calc ? { facturado: calc.facturado } : {})
    const datos = Object.fromEntries(campos.map((k) => [k.id, l.datos?.[k.id] ?? texto(k, base[k.id])]))
    return { datos, fecha: l.fecha ?? (calc?.fecha_pago || fechaDef) }
  }
  const numeros = (datos) => Object.fromEntries(campos.map((k) => [k.id, num(datos[k.id])]))
  const hayDatos = (datos) => campos.some((k) => num(datos[k.id]) > 0)

  async function guardarFila(c, datosTxt, fecha) {
    const prev = calcDe(c.id)
    setGuardando((g) => ({ ...g, [c.id]: true })); setErr('')
    try {
      if (!hayDatos(datosTxt)) { if (prev) await quitar(prev); return }
      const datos = numeros(datosTxt)
      const res = calcularPlan(plan, datos)
      const facturado = datos.facturado ?? datos[primerCampoDinero(campos)] ?? 0
      const fila = { plan_id: plan.id, account_id: c.id, periodo_desde: periodo.desde, periodo_hasta: periodo.hasta, facturado, datos, detalle: res.aplicadas, escalon_idx: null, monto: res.monto, fecha_pago: fecha || fechaDef, updated_at: new Date().toISOString() }
      const { data: calc, error } = await supabase.from('bonus_calculos').upsert(fila, { onConflict: 'plan_id,account_id,periodo_desde' }).select().single()
      if (error) throw new Error(errMig(error.message))
      const { data: ex } = await supabase.from('payout_bonuses').select('*').eq('calculo_id', calc.id)
      const b = (ex || []).find((x) => x.calculo_id === calc.id)
      if (b?.aplicado_en) await restarBonoDePago(b)
      const resumenDatos = campos.filter((k) => num(datos[k.id]) > 0).map((k) => `${k.nombre} ${k.tipo === 'dinero' ? money(datos[k.id]) : datos[k.id]}`).join(' · ')
      if (!(calc.monto > 0)) {
        if (b) await supabase.from('payout_bonuses').delete().eq('id', b.id)
        setMsg(`${c.nombre}: con esos datos no se cumple ninguna regla, no hay bono.`)
      } else {
        const datosB = { account_id: c.id, nombre: `${plan.nombre} · ${periodo.etiqueta}`, monto: calc.monto, fecha_cobro: calc.fecha_pago, calculo_id: calc.id, aplicado_en: null,
          nota: `${resumenDatos} → ${res.aplicadas.map((a) => `${a.nombre} ${money(a.monto)}`).join(' + ')}${res.topado ? ' (limitado al máximo)' : ''}` }
        let nuevo
        if (b) { const r = await supabase.from('payout_bonuses').update(datosB).eq('id', b.id); if (r.error) throw new Error(errMig(r.error.message)); nuevo = { ...b, ...datosB } }
        else { const r = await supabase.from('payout_bonuses').insert([datosB]).select().single(); if (r.error) throw new Error(errMig(r.error.message)); nuevo = r.data }
        const s = await sumarBonoAPago({ ...nuevo, account_id: c.id })
        setMsg(`✓ ${c.nombre}: bono de ${money(calc.monto)} enviado al cuadro general (cobro ${fmtF(calc.fecha_pago)})${s.creado ? ' (no había pago ese día: se creó uno en el cuadro general con este bono)' : s.ok ? ' y sumado al pago de esa fecha' : ''}.${s.pagado ? ' Ese pago ya estaba marcado como Pagado: revisa que el extra se abone.' : ''}`)
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
  const cabeceras = ['Chatter', ...campos.map((k) => k.nombre), 'Reglas cumplidas', 'Bono', 'Fecha de cobro', 'Estado']

  return (
    <Panel className="mb-5">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="font-medium">{plan.nombre} <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{plan.periodicidad === 'mensual' ? 'Mensual' : 'Quincenal'}</span></p>
          {resumenPlan(plan).map((t, i) => <p key={i} className="text-xs mt-0.5" style={lbl}>{t}</p>)}
          <p className="text-xs mt-1" style={lbl}>{modoDePlan(plan) === 'sumar' ? 'Se suman todas las reglas que se cumplan' : 'Se paga solo la primera regla que se cumpla'}{num(plan.tope) > 0 ? ` · máximo ${money(plan.tope)}` : ''} · {plan.cuentas ? `Aplica a ${filas.length} chatter(s)` : 'Aplica a todos los activos'}{plan.nota ? ` · ${plan.nota}` : ''}</p>
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
        <span className="text-xs" style={lbl}>Fecha de cobro por defecto: <strong style={{ color: 'var(--text)' }}>{fmtF(fechaDef)}</strong></span>
        <span className="ml-auto text-sm" style={lbl}>Total de bonos de este periodo: <strong className="gold-text">{money(totalPeriodo)}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{cabeceras.map(th)}</tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={cabeceras.length} className="px-3 py-4 text-center text-sm" style={lbl}>No hay chatters en este bono.</td></tr>}
            {filas.map((c) => {
              const v = valores(c); const calc = calcDe(c.id)
              const vivo = calcularPlan(plan, numeros(v.datos))
              const b = calc ? bonos.find((x) => x.calculo_id === calc.id) : null
              const pago = b?.aplicado_en ? pagos.find((p) => p.id === b.aplicado_en) : null
              const sinGuardar = !!local[c.id]
              const estado = guardando[c.id] ? 'Guardando…'
                : sinGuardar ? 'Cambios sin guardar'
                : !calc ? '—'
                : !(calc.monto > 0) ? 'No se cumple ninguna regla'
                : pago ? `✓ Sumado al pago del ${fmtF(pago.fecha)}${pago.estado === 'Pagado' ? ' (pagado)' : ''}`
                : b ? `✓ En el cuadro general · se suma al pago del ${fmtF(calc.fecha_pago)}`
                : 'Falta enviarlo: vuelve a guardar la fila'
              const ok = !sinGuardar && calc && calc.monto > 0 && b
              const cambiar = (k, val) => setLocal((l) => ({ ...l, [c.id]: { datos: { ...(l[c.id]?.datos || {}), [k.id]: val }, fecha: l[c.id]?.fecha } }))
              const guardar = () => guardarFila(c, { ...v.datos, ...(local[c.id]?.datos || {}) }, local[c.id]?.fecha ?? v.fecha)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap">{c.nombre}</td>
                  {campos.map((k) => (
                    <td key={k.id} className="px-3 py-2"><div className="w-36">
                      {k.tipo === 'dinero'
                        ? <MoneyInput value={v.datos[k.id]} placeholder="$ 0.00" onChange={(e) => cambiar(k, e.target.value)} />
                        : <MoneyInput value={v.datos[k.id]} placeholder="0" onChange={(e) => cambiar(k, e.target.value.replace(/,/g, '.'))} />}
                    </div></td>
                  ))}
                  <td className="px-3 py-2 text-xs" style={lbl}>{vivo.aplicadas.length ? vivo.aplicadas.map((a) => `${a.nombre} ${money(a.monto)}`).join(' + ') : '—'}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold gold-text whitespace-nowrap">{vivo.monto > 0 ? money(vivo.monto) : <span style={lbl}>—</span>}</td>
                  <td className="px-3 py-2"><div className="w-36"><Input type="date" value={v.fecha}
                    onChange={(e) => { const f = e.target.value; setLocal((l) => ({ ...l, [c.id]: { datos: l[c.id]?.datos || {}, fecha: f } })); }} /></div></td>
                  <td className="px-3 py-2 text-xs" style={{ color: ok ? 'var(--success)' : 'var(--text-muted)' }}>
                    {sinGuardar && !guardando[c.id] && <button type="button" onClick={guardar} className="mr-2 px-3 py-1 rounded-md text-xs font-medium" style={{ background: 'var(--accent)', color: '#000' }}>Guardar</button>}
                    {estado}
                    {calc && !guardando[c.id] && <button className="ml-2 underline" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`¿Quitar el cálculo de ${c.nombre}? El bono dejará de aparecer en el cuadro general.`)) quitar(calc).then(onCambio) }}>quitar</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs" style={lbl}>Escribe los datos de cada chatter (el bono se calcula al momento) y pulsa Guardar en su fila: se envía al cuadro general con su fecha de cobro. Puedes cambiar la fecha de cobro de cada chatter con el calendario de su fila: el bono se mueve solo al pago de esa fecha (si no hay pago ese día, se crea uno).</p>
    </Panel>
  )
}
