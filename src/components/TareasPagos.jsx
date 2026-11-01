import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Button, Input, Select } from './ui'
import { cargarTareas, hoyISO, calcularItem, rangosTarea, esRecurrente, diasPagoDe } from '../lib/payTasks'

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100
const money = (n) => '$' + Math.abs(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (s) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
const lbl = { color: 'var(--text-muted)' }
const inp = { background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }
const VACIA = { id: null, titulo: '', descripcion: '', responsable_id: '', monto: '', tipo: 'puntual', fecha_pago: hoyISO(), dia_pago: '5', desde: hoyISO(), q1: '1', q2: '16', lista: '5, 12, 20' }
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const difDias = (a, b) => Math.round((aDate(a) - aDate(b)) / 86400000)
const diasDe = (a, b) => { const o = []; for (let f = a; f <= b; f = sumarDias(f, 1)) o.push(f); return o }
const fmtC = (s) => s.slice(8, 10) + '/' + s.slice(5, 7)
const textoRangos = (r) => (r.length ? r.map(([a, b]) => (a === b ? fmtC(a) : `${fmtC(a)} → ${fmtC(b)}`)).join(' · ') : 'ningún día')
const cuando = (t) => t.tipo === 'puntual' ? `Una vez · ${fmtF(t.fecha_pago)}` : t.tipo === 'mensual' ? `Mensual · día ${t.dia_pago}` : t.tipo === 'quincenal' ? `Quincenal · días ${diasPagoDe(t).join(' y ')}` : `Días ${diasPagoDe(t).join(', ')} de cada mes`

export default function TareasPagos({ onCambio, area = 'chatting' }) {
  const [tasks, setTasks] = useState([])
  const [items, setItems] = useState([])
  const [personas, setPersonas] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('pendientes')
  const [fResp, setFResp] = useState('todos')
  const [itemEd, setItemEd] = useState(null) // edición independiente de una fila de cobro
  const [papelera, setPapelera] = useState([])
  const [faltas, setFaltas] = useState(null) // { id, d1, d2 } panel de faltas de una tarea

  async function cargar() {
    const [t, pr] = await Promise.all([cargarTareas(area), supabase.from('profiles').select('id, full_name, active, extrabajador').order('full_name')])
    if (t.error) setMsg(t.error.includes('pay_task') ? 'Falta ejecutar la migración 74 en Supabase (pago por tareas).' : t.error)
    setTasks(t.tasks); setItems(t.items)
    const pp = await supabase.from('pay_task_papelera').select('*').eq('area', area).order('eliminado_at', { ascending: false }).limit(200)
    setPapelera(pp.error ? [] : (pp.data || []))
    setPersonas((pr.data || []).filter((p) => p.active !== false && !p.extrabajador))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])
  const nombre = (id) => personas.find((p) => p.id === id)?.full_name || 'Sin responsable'
  const tareaDe = (id) => tasks.find((t) => t.id === id)
  const estadoItem = (i) => (i.aplicado_en ? 'incluido' : i.pagado_at ? 'pagado' : 'pendiente')
  const cambio = async () => { await cargar(); onCambio?.() }

  async function guardar(e) {
    e.preventDefault()
    const f = form
    if (!f.titulo.trim()) return setMsg('Pon un nombre a la tarea.')
    if (!f.responsable_id) return setMsg('Elige al responsable.')
    if (!(num(f.monto) > 0)) return setMsg('Pon el importe a pagar.')
    if (f.tipo === 'puntual' && !f.fecha_pago) return setMsg('Pon el día del pago.')
    const dia = Math.round(num(f.dia_pago))
    if (f.tipo === 'mensual' && (dia < 1 || dia > 28)) return setMsg('El día del mes debe estar entre 1 y 28.')
    let dp = null
    if (f.tipo === 'quincenal') {
      dp = [Math.round(num(f.q1)), Math.round(num(f.q2))]
      if (dp.some((d) => d < 1 || d > 28) || dp[0] === dp[1]) return setMsg('Los dos días de pago deben ser distintos y estar entre el 1 y el 28.')
    }
    if (f.tipo === 'dias') {
      dp = [...new Set(String(f.lista).split(/[^0-9]+/).filter(Boolean).map(Number))].sort((a, b) => a - b)
      if (!dp.length || dp.some((d) => d < 1 || d > 28)) return setMsg('Escribe los días del mes separados por comas (entre el 1 y el 28). Ej.: 5, 12, 20')
    }
    const payload = {
      area, titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, responsable_id: f.responsable_id, monto: r2(num(f.monto)), tipo: f.tipo,
      fecha_pago: f.tipo === 'puntual' ? f.fecha_pago : null, dia_pago: f.tipo === 'mensual' ? dia : null, dias_pago: dp, desde: f.tipo !== 'puntual' ? (f.desde || hoyISO()) : null,
    }
    if (f.id) {
      // al editar, lo pendiente se recalcula con los datos nuevos; lo ya incluido en un pago o pagado no se toca
      const r = await supabase.from('pay_tasks').update(payload).eq('id', f.id)
      if (r.error) return setMsg(/dias_pago|pay_tasks_tipo_chk/.test(r.error.message) ? 'Falta ejecutar la migración 80 en Supabase.' : r.error.message)
      await supabase.from('pay_task_items').delete().eq('task_id', f.id).is('aplicado_en', null).is('pagado_at', null).neq('editado', true) // las filas editadas a mano se respetan
    } else {
      const r = await supabase.from('pay_tasks').insert([payload])
      if (r.error) return setMsg(/dias_pago|pay_tasks_tipo_chk/.test(r.error.message) ? 'Falta ejecutar la migración 80 en Supabase.' : r.error.message.includes('pay_tasks') ? 'Falta ejecutar la migración 74 en Supabase.' : r.error.message)
    }
    setForm(null); setMsg(''); cambio()
  }
  async function alternarActiva(t) { await supabase.from('pay_tasks').update({ activa: !t.activa }).eq('id', t.id); cambio() }
  // Si el cobro ya estaba sumado a un pago (de chatter o de manager), se resta de ese pago antes de borrarlo
  async function revertirItem(i) {
    if (!i.aplicado_en) return
    const m = num(i.monto)
    if (i.aplicado_tipo === 'manager') {
      const data = ((await supabase.from('manager_pay_periods').select('id, importe_tareas, importe_pagado').eq('id', i.aplicado_en)).data || []).find((x) => x.id === i.aplicado_en)
      if (data) await supabase.from('manager_pay_periods').update({ importe_tareas: Math.max(0, r2(num(data.importe_tareas) - m)), importe_pagado: r2(num(data.importe_pagado) - m) }).eq('id', data.id)
    } else {
      const data = ((await supabase.from('chatter_payouts').select('id, bonos').eq('id', i.aplicado_en)).data || []).find((x) => x.id === i.aplicado_en)
      if (data) await supabase.from('chatter_payouts').update({ bonos: Math.max(0, r2(num(data.bonos) - m)) }).eq('id', data.id)
    }
  }
  // Guarda una copia en la papelera para poder restaurarlo
  async function aPapelera(tipo, titulo, payload) {
    const r = await supabase.from('pay_task_papelera').insert([{ area, tipo, titulo, payload }])
    if (r.error) { setMsg(/pay_task_papelera/.test(r.error.message) ? 'Falta ejecutar la migración 81 en Supabase (papelera de tareas). No se ha eliminado nada.' : r.error.message); return false }
    return true
  }
  async function borrar(t) {
    const suyos = items.filter((i) => i.task_id === t.id)
    const ya = suyos.filter((i) => i.aplicado_en || i.pagado_at)
    if (!window.confirm(`¿Eliminar la tarea «${t.titulo}»?\n\nSe borra la tarea y todos sus cobros (${suyos.length}) y desaparece de los pagos.${ya.length ? `\n\n${ya.length} cobro(s) ya estaban pagados o incluidos en un pago: los incluidos se restan de ese pago (Bonos o pago de manager).` : ''}\n\nSi te equivocas, puedes restaurarla desde la Papelera.`)) return
    if (!(await aPapelera('tarea', t.titulo, { task: t, items: suyos }))) return
    for (const i of suyos) await revertirItem(i)
    await supabase.from('pay_task_items').delete().eq('task_id', t.id)
    const r = await supabase.from('pay_tasks').delete().eq('id', t.id)
    if (r.error) return setMsg(r.error.message)
    cambio()
  }
  // Vuelve a sumar el cobro al pago en el que estaba (si ese pago sigue existiendo)
  async function reaplicarItem(i) {
    if (!i.aplicado_en) return i
    const m = num(i.monto)
    if (i.aplicado_tipo === 'manager') {
      const data = ((await supabase.from('manager_pay_periods').select('id, importe_tareas, importe_pagado').eq('id', i.aplicado_en)).data || []).find((x) => x.id === i.aplicado_en)
      if (!data) return { ...i, aplicado_en: null, aplicado_tipo: null }
      await supabase.from('manager_pay_periods').update({ importe_tareas: r2(num(data.importe_tareas) + m), importe_pagado: r2(num(data.importe_pagado) + m) }).eq('id', data.id)
    } else {
      const data = ((await supabase.from('chatter_payouts').select('id, bonos').eq('id', i.aplicado_en)).data || []).find((x) => x.id === i.aplicado_en)
      if (!data) return { ...i, aplicado_en: null, aplicado_tipo: null }
      await supabase.from('chatter_payouts').update({ bonos: r2(num(data.bonos) + m) }).eq('id', data.id)
    }
    return i
  }
  async function restaurar(r) {
    setMsg('')
    if (r.tipo === 'tarea') {
      const { task, items: its } = r.payload
      const ins = await supabase.from('pay_tasks').insert([task])
      if (ins.error) return setMsg('No se pudo restaurar la tarea: ' + ins.error.message)
      const filas = []
      for (const i of its) filas.push(await reaplicarItem(i))
      if (filas.length) {
        const r2_ = await supabase.from('pay_task_items').upsert(filas, { onConflict: 'id' })
        if (r2_.error) return setMsg('Se restauró la tarea pero fallaron algunos cobros: ' + r2_.error.message)
      }
    } else {
      const { item, omit } = r.payload
      const t = item.task_id ? tareaDe(item.task_id) : null
      if (item.task_id && !t) return setMsg('Esa tarea también está eliminada: restaura primero la tarea (o restáurala entera desde aquí).')
      const fila = await reaplicarItem(item)
      const ins = await supabase.from('pay_task_items').upsert([fila], { onConflict: 'id' })
      if (ins.error) return setMsg('No se pudo restaurar el cobro: ' + ins.error.message)
      if (t && omit) await supabase.from('pay_tasks').update({ omitidos: (t.omitidos || []).filter((x) => x !== omit) }).eq('id', t.id)
    }
    await supabase.from('pay_task_papelera').delete().eq('id', r.id)
    cambio()
  }
  async function borrarDefinitivo(r) {
    if (!window.confirm(`¿Borrar «${r.titulo}» de la papelera para siempre? Ya no se podrá restaurar.`)) return
    await supabase.from('pay_task_papelera').delete().eq('id', r.id); cargar()
  }

  // ---- faltas: días que el responsable no trabajó, se descuentan solos del pago que los cubre ----
  async function aplicarFaltas(t, fechas, quitar) {
    if (!fechas.length) return setMsg('Elige al menos un día.')
    const nuevas = quitar ? (t.faltas || []).filter((d) => !fechas.includes(d)) : [...new Set([...(t.faltas || []), ...fechas])].sort()
    const u = await supabase.from('pay_tasks').update({ faltas: nuevas }).eq('id', t.id)
    if (u.error) return setMsg(/faltas/.test(u.error.message) ? 'Falta ejecutar la migración 81 en Supabase.' : u.error.message)
    let sinCambio = 0
    for (const i of items.filter((x) => x.task_id === t.id && x.periodo_desde)) {
      const toca = fechas.filter((d) => d >= i.periodo_desde && d <= i.periodo_hasta)
      if (!toca.length) continue
      if (i.aplicado_en || i.pagado_at) { sinCambio += toca.length; continue } // ya pagado/incluido: no se toca
      const libres = quitar ? (i.dias_libres || []).filter((d) => !toca.includes(d)) : [...new Set([...(i.dias_libres || []), ...toca])].sort()
      const c = calcularItem({ base: i.monto_base ?? i.monto, desde: i.periodo_desde, hasta: i.periodo_hasta, libres, inicio: t.desde || null })
      await supabase.from('pay_task_items').update({ dias_libres: libres, monto: c.aPagar }).eq('id', i.id)
    }
    setMsg(sinCambio ? `${sinCambio} día(s) caen en un pago que ya estaba pagado o incluido: ese pago no se modifica (puedes ajustarlo editándolo).` : '')
    setFaltas((f) => ({ ...f, d1: '', d2: '' })); cambio()
  }
  async function marcarPagado(i) { await supabase.from('pay_task_items').update({ pagado_at: new Date().toISOString() }).eq('id', i.id); cambio() }
  async function deshacerPagado(i) { await supabase.from('pay_task_items').update({ pagado_at: null }).eq('id', i.id); cambio() }
  function abrirItem(i) {
    const t = tareaDe(i.task_id)
    setItemEd({ id: i.id, fecha_pago: i.fecha_pago, monto: String(i.monto), titulo: i.titulo || '', responsable_id: i.responsable_id || '', original: i.fecha_original || i.fecha_pago, est: estadoItem(i),
      tieneP: !!i.periodo_desde, desde: i.periodo_desde || '', hasta: i.periodo_hasta || '', base: String(i.monto_base ?? i.monto), libres: i.dias_libres || [], inicio: t && esRecurrente(t) ? (t.desde || null) : null })
  }
  const calcEd = (e) => (e && e.tieneP && e.desde && e.hasta && e.desde <= e.hasta ? calcularItem({ base: e.base, desde: e.desde, hasta: e.hasta, libres: e.libres, inicio: e.inicio }) : null)
  async function guardarItem() {
    const e = itemEd
    if (!e.fecha_pago) return setMsg('Pon el día de pago.')
    if (!e.responsable_id) return setMsg('Elige al responsable.')
    const c = calcEd(e)
    if (e.tieneP && !c) return setMsg('El periodo no es válido: la fecha «desde» debe ser anterior o igual a «hasta».')
    const monto = e.tieneP ? c.aPagar : r2(num(e.monto))
    if (!(monto > 0) && !e.tieneP) return setMsg('Pon el importe.')
    const upd = { fecha_pago: e.fecha_pago, monto, titulo: e.titulo.trim() || 'Tarea', responsable_id: e.responsable_id, fecha_original: e.original, editado: true }
    if (e.tieneP) Object.assign(upd, { periodo_desde: e.desde, periodo_hasta: e.hasta, monto_base: r2(num(e.base)), dias_libres: e.libres.filter((d) => d >= e.desde && d <= e.hasta) })
    const r = await supabase.from('pay_task_items').update(upd).eq('id', e.id)
    if (r.error) return setMsg(/editado|fecha_original/.test(r.error.message) ? 'Falta ejecutar la migración 78 en Supabase.' : /periodo|monto_base|dias_libres/.test(r.error.message) ? 'Falta ejecutar la migración 80 en Supabase.' : r.error.message)
    setItemEd(null); setMsg(''); cambio()
  }
  async function borrarItem(i) {
    const t = tareaDe(i.task_id)
    if (t && t.tipo === 'puntual') return borrar(t) // una tarea puntual solo tiene este cobro: se elimina entera
    if (!window.confirm(`¿Eliminar este cobro (${fmtF(i.fecha_pago)} · ${money(i.monto)})?${i.aplicado_en ? '\n\nYa estaba incluido en un pago: se resta de ese pago.' : ''}\n\nLa tarea sigue activa en el resto de fechas. Puedes restaurarlo desde la Papelera.`)) return
    const f0x = i.fecha_original || i.fecha_pago
    if (!(await aPapelera('cobro', `${i.titulo} · ${fmtF(i.fecha_pago)}`, { item: i, omit: t ? (t.tipo === 'mensual' ? f0x.slice(0, 7) : f0x) : null }))) return
    await revertirItem(i)
    await supabase.from('pay_task_items').delete().eq('id', i.id)
    if (t) { const f0 = i.fecha_original || i.fecha_pago; await supabase.from('pay_tasks').update({ omitidos: [...new Set([...(t.omitidos || []), t.tipo === 'mensual' ? f0.slice(0, 7) : f0])] }).eq('id', t.id) } // para que no se vuelva a generar
    cambio()
  }

  const visibles = useMemo(() => items.filter((i) => (fResp === 'todos' || i.responsable_id === fResp) && (filtro === 'todos' || (filtro === 'pendientes' ? estadoItem(i) === 'pendiente' : estadoItem(i) !== 'pendiente'))).sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago)), [items, filtro, fResp]) // eslint-disable-line
  const pendientes = items.filter((i) => estadoItem(i) === 'pendiente')
  const totalPend = r2(pendientes.reduce((a, i) => a + num(i.monto), 0))
  const vencidas = r2(pendientes.filter((i) => i.fecha_pago <= hoyISO()).reduce((a, i) => a + num(i.monto), 0))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  if (cargando) return <p className="text-sm" style={lbl}>Cargando…</p>
  return (
    <div className="space-y-5">
      {msg && <p className="text-sm" style={{ color: 'var(--danger)' }}>{msg}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['Pendiente de cobrar (todas las fechas)', money(totalPend)], ['Ya vencido (toca pagar ya)', money(vencidas)], ['Tareas activas', String(tasks.filter((t) => t.activa).length)]].map(([t, v]) => (
          <Panel key={t} className="p-4"><p className="text-xs mb-1" style={lbl}>{t}</p><p className="font-display text-lg font-semibold tabular-nums">{v}</p></Panel>
        ))}
      </div>
      <p className="text-xs" style={lbl}>Cuando registres un pago a un chatter (Pagos → Registrar pago) o pagues a un manager, sus tareas con día de pago hasta esa fecha aparecen solas y se suman al total.</p>

      {form ? (
        <Panel className="p-5">
          <form onSubmit={guardar} className="space-y-3">
            <p className="font-medium">{form.id ? 'Editar tarea' : 'Nueva tarea'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs block mb-1" style={lbl}>Tarea</label><Input value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Ej.: Edición de reels de la semana" /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Responsable</label>
                <Select value={form.responsable_id} onChange={(e) => set({ responsable_id: e.target.value })}><option value="">— elige —</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
              <div><label className="text-xs block mb-1" style={lbl}>{form.tipo === 'puntual' ? 'Importe a pagar ($)' : 'Importe de cada pago ($, con todos los días trabajados)'}</label><Input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => set({ monto: e.target.value })} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>Tipo</label>
                <div className="flex gap-2 flex-wrap">{[['puntual', 'Puntual (una vez)'], ['mensual', 'Mensual'], ['quincenal', 'Quincenal'], ['dias', 'Días concretos del mes']].map(([k, t]) => (
                  <button key={k} type="button" onClick={() => set({ tipo: k })} className="px-3 py-1.5 rounded-md text-sm" style={{ background: form.tipo === k ? 'var(--accent)' : 'var(--panel-alt)', color: form.tipo === k ? '#000' : 'var(--text)', border: '1px solid ' + (form.tipo === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>))}</div></div>
              {form.tipo === 'puntual' ? (
                <div><label className="text-xs block mb-1" style={lbl}>Día del pago</label><input type="date" value={form.fecha_pago} onChange={(e) => set({ fecha_pago: e.target.value })} className="rounded-md px-3 py-2 text-sm w-full" style={inp} /></div>
              ) : (
                <>
                  {form.tipo === 'mensual' && <div><label className="text-xs block mb-1" style={lbl}>Se paga el día (1-28) de cada mes</label><Input type="number" min="1" max="28" value={form.dia_pago} onChange={(e) => set({ dia_pago: e.target.value })} /></div>}
                  {form.tipo === 'quincenal' && <div><label className="text-xs block mb-1" style={lbl}>Se paga dos veces al mes: días (1-28)</label><div className="flex gap-2 items-center"><Input type="number" min="1" max="28" value={form.q1} onChange={(e) => set({ q1: e.target.value })} /><span style={lbl}>y</span><Input type="number" min="1" max="28" value={form.q2} onChange={(e) => set({ q2: e.target.value })} /></div></div>}
                  {form.tipo === 'dias' && <div><label className="text-xs block mb-1" style={lbl}>Días del mes en que se paga (separados por comas, 1-28)</label><Input value={form.lista} onChange={(e) => set({ lista: e.target.value })} placeholder="5, 12, 20" /></div>}
                  <div><label className="text-xs block mb-1" style={lbl}>Empieza a contar desde</label><input type="date" value={form.desde} onChange={(e) => set({ desde: e.target.value })} className="rounded-md px-3 py-2 text-sm w-full" style={inp} /></div>
                </>
              )}
            </div>
            <div><label className="text-xs block mb-1" style={lbl}>Descripción (opcional)</label><textarea value={form.descripcion} onChange={(e) => set({ descripcion: e.target.value })} rows={2} className="w-full rounded-md px-3 py-2 text-sm" style={inp} /></div>
            <div className="flex gap-2"><Button type="submit">{form.id ? 'Guardar cambios' : 'Crear tarea'}</Button><Button type="button" variant="ghost" onClick={() => { setForm(null); setMsg('') }}>Cancelar</Button></div>
            {form.id && <p className="text-xs" style={lbl}>Al guardar, los cobros pendientes de esta tarea se recalculan con los datos nuevos. Los ya pagados o incluidos en un pago no cambian.</p>}
          </form>
        </Panel>
      ) : <div><Button onClick={() => setForm({ ...VACIA })}>+ Nueva tarea</Button></div>}

      {faltas && tareaDe(faltas.id) && (() => {
        const t = tareaDe(faltas.id)
        const d2 = faltas.d2 || faltas.d1
        const lista = faltas.d1 && d2 && faltas.d1 <= d2 && difDias(d2, faltas.d1) <= 62 ? diasDe(faltas.d1, d2) : []
        return (
          <Panel className="p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <p className="font-medium">Faltas de {nombre(t.responsable_id)} en «{t.titulo}»</p>
              <button className="text-xs underline" style={lbl} onClick={() => setFaltas(null)}>Cerrar</button>
            </div>
            <p className="text-xs mb-3" style={lbl}>Marca los días que no trabajó: se descuentan solos del pago que cubre ese día (importe base ÷ días del periodo por cada día), y de los pagos que se generen más adelante. Si el día cae en un pago ya pagado o incluido, ese pago no se toca.</p>
            <div className="flex items-end gap-2 flex-wrap">
              <div><label className="text-xs block mb-1" style={lbl}>Falta desde</label><input type="date" value={faltas.d1} onChange={(e) => setFaltas((f) => ({ ...f, d1: e.target.value }))} className="rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <div><label className="text-xs block mb-1" style={lbl}>hasta (opcional)</label><input type="date" value={faltas.d2} min={faltas.d1} onChange={(e) => setFaltas((f) => ({ ...f, d2: e.target.value }))} className="rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
              <Button onClick={() => aplicarFaltas(t, lista, false)} disabled={!lista.length}>Añadir {lista.length > 1 ? `${lista.length} días` : 'falta'}</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(t.faltas || []).length === 0 ? <span className="text-xs" style={lbl}>Todavía no hay faltas registradas en esta tarea.</span> : (t.faltas || []).map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs tabular-nums" style={{ background: 'var(--danger)', color: '#fff' }}>{fmtF(d)}
                  <button type="button" title="Quitar la falta (vuelve a contar como trabajado)" onClick={() => aplicarFaltas(t, [d], true)} style={{ color: '#fff' }}>✕</button></span>
              ))}
            </div>
          </Panel>
        )
      })()}

      <Panel>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}><p className="font-medium">Tareas</p></div>
        {tasks.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>Todavía no hay tareas. Crea la primera con «+ Nueva tarea».</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Tarea', 'Responsable', 'Importe', 'Cuándo se paga', 'Estado', ''].map((c) => <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>
            <tbody>{tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', opacity: t.activa ? 1 : 0.55 }}>
                <td className="px-3 py-3"><strong>{t.titulo}</strong>{t.descripcion && <span className="block text-xs" style={lbl}>{t.descripcion}</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap">{nombre(t.responsable_id)}</td>
                <td className="px-3 py-3 tabular-nums font-semibold">{money(t.monto)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{cuando(t)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{t.activa ? <span style={{ color: 'var(--success)' }}>Activa</span> : <span style={lbl}>Pausada</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap space-x-3">
                  <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => setForm({ id: t.id, titulo: t.titulo, descripcion: t.descripcion || '', responsable_id: t.responsable_id, monto: String(t.monto), tipo: t.tipo, fecha_pago: t.fecha_pago || hoyISO(), dia_pago: String(t.dia_pago || 5), desde: t.desde || hoyISO(), q1: String(t.tipo === 'quincenal' ? diasPagoDe(t)[0] : 1), q2: String(t.tipo === 'quincenal' ? diasPagoDe(t)[1] : 16), lista: t.tipo === 'dias' ? diasPagoDe(t).join(', ') : '5, 12, 20' })}>Editar</button>
                  {esRecurrente(t) && <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => setFaltas({ id: t.id, d1: '', d2: '' })}>Faltas{(t.faltas || []).length ? ` (${t.faltas.length})` : ''}</button>}
                  <button className="text-xs underline" style={lbl} onClick={() => alternarActiva(t)}>{t.activa ? 'Pausar' : 'Reactivar'}</button>
                  <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(t)}>Eliminar</button>
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>

      <Panel>
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-medium mr-2">Cobros de tareas</p>
          {[['pendientes', 'Pendientes'], ['pagados', 'Pagados / incluidos'], ['todos', 'Todos'], ['eliminados', `Eliminados${papelera.length ? ` (${papelera.length})` : ''}`]].map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)} className="px-3 py-1 rounded-md text-xs" style={{ background: filtro === k ? 'var(--accent)' : 'var(--panel-alt)', color: filtro === k ? '#000' : 'var(--text)', border: '1px solid ' + (filtro === k ? 'var(--accent)' : 'var(--border)') }}>{t}</button>))}
          <div className="ml-auto w-48"><Select value={fResp} onChange={(e) => setFResp(e.target.value)}><option value="todos">Todos los responsables</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
        </div>
        {filtro === 'eliminados' ? (
        papelera.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay nada eliminado.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>{['Eliminado', 'Qué era', 'Detalle', ''].map((c) => <th key={c} className="text-left px-3 py-2.5 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>
            <tbody>{papelera.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5 whitespace-nowrap">{fmtF(r.eliminado_at)}</td>
                <td className="px-3 py-2.5"><strong>{r.titulo}</strong><span className="block text-xs" style={lbl}>{r.tipo === 'tarea' ? 'Tarea entera' : 'Un cobro'} · {nombre(r.tipo === 'tarea' ? r.payload.task.responsable_id : r.payload.item.responsable_id)}</span></td>
                <td className="px-3 py-2.5 text-xs" style={lbl}>{r.tipo === 'tarea' ? `${cuando(r.payload.task)} · ${r.payload.items.length} cobro(s) · ${money(r.payload.task.monto)}` : `Pago del ${fmtF(r.payload.item.fecha_pago)} · ${money(r.payload.item.monto)}${r.payload.item.aplicado_en ? ' · estaba incluido en un pago' : ''}`}</td>
                <td className="px-3 py-2.5 whitespace-nowrap space-x-3">
                  <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => restaurar(r)}>Restaurar</button>
                  <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrarDefinitivo(r)}>Borrar para siempre</button>
                </td>
              </tr>))}</tbody>
          </table></div>
        )
        ) : visibles.length === 0 ? <p className="p-6 text-sm text-center" style={lbl}>No hay cobros en esta vista.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>{['Día de pago', 'Tarea', 'Responsable', 'Días trabajados', 'Importe', 'Estado', ''].map((c) => <th key={c} className="text-left px-3 py-3 font-medium whitespace-nowrap" style={lbl}>{c}</th>)}</tr></thead>
            <tbody>{visibles.map((i) => {
              const est = estadoItem(i)
              if (itemEd?.id === i.id) {
                const sI = (patch) => setItemEd((x) => ({ ...x, ...patch }))
                const c = calcEd(itemEd)
                const aviso = est !== 'pendiente' ? 'Ojo: ya está incluido/pagado; el cambio no modifica el pago ya registrado.' : 'Solo cambia esta fila; la tarea y el resto de pagos no se tocan.'
                const fuera = (d) => !!itemEd.inicio && d < itemEd.inicio
                if (!itemEd.tieneP) return (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
                    <td className="px-3 py-3"><input type="date" value={itemEd.fecha_pago} onChange={(e) => sI({ fecha_pago: e.target.value })} className="rounded px-2 py-1 text-sm" style={inp} /></td>
                    <td className="px-3 py-3"><input value={itemEd.titulo} onChange={(e) => sI({ titulo: e.target.value })} className="rounded px-2 py-1 text-sm w-full min-w-[140px]" style={inp} /></td>
                    <td className="px-3 py-3"><Select value={itemEd.responsable_id} onChange={(e) => sI({ responsable_id: e.target.value })}>{personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></td>
                    <td className="px-3 py-3 text-xs" style={lbl}>—</td>
                    <td className="px-3 py-3"><input type="number" step="0.01" value={itemEd.monto} onChange={(e) => sI({ monto: e.target.value })} className="rounded px-2 py-1 text-sm w-24" style={inp} /></td>
                    <td className="px-3 py-3 text-xs" style={lbl}>{aviso}</td>
                    <td className="px-3 py-3 whitespace-nowrap space-x-3">
                      <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={guardarItem}>Guardar</button>
                      <button className="text-xs underline" style={lbl} onClick={() => setItemEd(null)}>Cancelar</button>
                    </td>
                  </tr>)
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel-alt)' }}>
                    <td colSpan={7} className="px-4 py-4">
                      <p className="text-xs mb-3" style={lbl}>Editar este pago de «{i.titulo}». {aviso}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><label className="text-xs block mb-1" style={lbl}>Fecha de pago</label><input type="date" value={itemEd.fecha_pago} onChange={(e) => sI({ fecha_pago: e.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Periodo desde</label><input type="date" value={itemEd.desde} onChange={(e) => sI({ desde: e.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Periodo hasta</label><input type="date" value={itemEd.hasta} onChange={(e) => sI({ hasta: e.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Días trabajados (de {c ? c.dias : '—'}) · automático</label><div className="w-full rounded-md px-2 py-1.5 text-sm font-semibold" style={{ ...inp, opacity: 0.85 }}>{c ? c.trabajados : '—'}</div></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Importe base ($)</label><input type="number" step="0.01" value={itemEd.base} onChange={(e) => sI({ base: e.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Descuento ($) · automático</label><div className="w-full rounded-md px-2 py-1.5 text-sm" style={{ ...inp, opacity: 0.85 }}>{c ? money(c.descuento) : '—'}</div></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Tarea</label><input value={itemEd.titulo} onChange={(e) => sI({ titulo: e.target.value })} className="w-full rounded-md px-2 py-1.5 text-sm" style={inp} /></div>
                        <div><label className="text-xs block mb-1" style={lbl}>Responsable</label><Select value={itemEd.responsable_id} onChange={(e) => sI({ responsable_id: e.target.value })}>{personas.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
                      </div>
                      {c && c.dias <= 120 && (
                        <div className="mt-4">
                          <p className="text-xs mb-2" style={lbl}>Días de trabajo exactos del periodo — pulsa un día para marcarlo como <strong>no trabajado</strong> (rojo) o trabajado (verde). Los días y el descuento se recalculan solos.</p>
                          <div className="flex flex-wrap gap-1">
                            {diasDe(itemEd.desde, itemEd.hasta).map((d) => {
                              const fu = fuera(d), off = itemEd.libres.includes(d)
                              return (
                                <button key={d} type="button" disabled={fu} onClick={() => sI({ libres: off ? itemEd.libres.filter((x) => x !== d) : [...itemEd.libres, d] })} title={fu ? 'Antes del inicio de la tarea' : off ? 'No trabajado: pulsa para marcarlo trabajado' : 'Trabajado: pulsa para marcarlo no trabajado'}
                                  className="rounded-md px-1.5 py-1 text-center tabular-nums" style={{ minWidth: 44, fontSize: 11, lineHeight: 1.2, background: fu ? 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 4px, var(--border) 4px, var(--border) 5px)' : off ? 'var(--danger)' : 'var(--accent-soft)', color: off ? '#fff' : 'var(--text)', border: '1px solid ' + (fu ? 'var(--border)' : off ? 'var(--danger)' : 'var(--success)'), cursor: fu ? 'not-allowed' : 'pointer' }}>
                                  <span className="block" style={{ opacity: 0.7 }}>{DIAS_SEMANA[aDate(d).getUTCDay()]}</span><strong>{fmtC(d)}</strong>
                                </button>)
                            })}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" style={lbl}>
                            <span>Trabajó: <strong style={{ color: 'var(--text)' }}>{textoRangos(rangosTarea(itemEd.desde, itemEd.hasta, itemEd.libres, itemEd.inicio))}</strong></span>
                            <button type="button" className="underline" onClick={() => sI({ libres: [] })}>Marcar todos trabajados</button>
                            <button type="button" className="underline" onClick={() => sI({ libres: diasDe(itemEd.desde, itemEd.hasta).filter((d) => !fuera(d)) })}>Marcar ninguno</button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-3">
                        <p className="text-sm">Total a pagar: <strong className="gold-text tabular-nums">{c ? money(c.aPagar) : '—'}</strong></p>
                        <Button onClick={guardarItem}>Guardar cambios</Button>
                        <button className="text-xs underline" style={lbl} onClick={() => setItemEd(null)}>Cancelar</button>
                      </div>
                    </td>
                  </tr>)
              }
              return (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-3 whitespace-nowrap">{fmtF(i.fecha_pago)}{i.editado && <span className="block text-[11px]" style={lbl}>editada</span>}{est === 'pendiente' && i.fecha_pago <= hoyISO() && <span className="block text-xs" style={{ color: 'var(--danger)' }}>vencido</span>}</td>
                  <td className="px-3 py-3">{i.titulo}{tareaDe(i.task_id)?.tipo === 'mensual' && <span className="text-xs" style={lbl}> · mensual</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{nombre(i.responsable_id)}</td>
                  <td className="px-3 py-3 text-xs">{i.periodo_desde ? (() => { const tk = tareaDe(i.task_id); const c = calcularItem({ base: i.monto_base ?? i.monto, desde: i.periodo_desde, hasta: i.periodo_hasta, libres: i.dias_libres || [], inicio: tk && esRecurrente(tk) ? tk.desde : null }); return <><strong>{c.trabajados} de {c.dias}</strong><span className="block" style={lbl}>{fmtC(i.periodo_desde)} → {fmtC(i.periodo_hasta)}</span><span className="block" style={lbl}>Trabajó: {textoRangos(rangosTarea(i.periodo_desde, i.periodo_hasta, i.dias_libres || [], tk && esRecurrente(tk) ? tk.desde : null))}</span></> })() : <span style={lbl}>—</span>}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{money(i.monto)}{i.monto_base != null && num(i.monto_base) !== num(i.monto) && <span className="block text-[11px] font-normal" style={lbl}>de {money(i.monto_base)}</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{est === 'pendiente' ? <span style={{ color: 'var(--gold)' }}>Pendiente</span> : est === 'incluido' ? <span style={{ color: 'var(--success)' }}>✓ Incluido en un pago de {i.aplicado_tipo === 'manager' ? 'manager' : 'chatter'}</span> : <span style={{ color: 'var(--success)' }}>✓ Pagado ({fmtF(i.pagado_at)})</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap space-x-3">
                    <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => abrirItem(i)}>Editar</button>
                    {est === 'pendiente' && <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={() => marcarPagado(i)} title="Para cuando la pagas aparte, sin meterla en el pago de un chatter o manager">Marcar pagado</button>}
                    {est === 'pagado' && <button className="text-xs underline" style={lbl} onClick={() => deshacerPagado(i)}>Deshacer</button>}
                    <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrarItem(i)}>Eliminar</button>
                  </td>
                </tr>)
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </div>
  )
}
