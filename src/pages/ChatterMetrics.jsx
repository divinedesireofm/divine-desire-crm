import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader, DeltaBadge } from '../components/ui'
import InformeIAModal from '../components/InformeIAModal'
import { exportarFichasChatters } from '../lib/excelExport'
import { reducirImagen } from '../lib/leerCapturas'
import { leerEstadisticasInflow } from '../lib/leerInflow'
import { leerLibro, parsearChatters, norm, fmtF, lunesDe, tiempoASegundos, segundosATexto } from '../lib/excelImport'

// Mismas métricas y fórmulas que el Excel SEGUIMIENTO_CHATTERS
const METRICAS = [
  { key: 'ventas_total', label: 'Ventas Totales + Subs', unit: '$', input: true, indica: 'Ventas totales del chatter en bruto (PPV + propinas + mensajes) más las renovaciones de subs conseguidas por ellos', fallo: 'Si baja, ha vendido menos en ese periodo. No siempre es por el chatter: puede ser tráfico; revisar Golden y Unlock Ratio y las demás métricas.' },
  { key: 'ventas_ppv', label: 'Ventas PPV', unit: '$', input: true, indica: 'Ventas en neto', fallo: '' },
  { key: 'propinas', label: 'Propinas', unit: '$', input: true, indica: 'Propinas en neto', fallo: '' },
  { key: 'mensajes_enviados', label: 'Mensajes Enviados', input: true, indica: 'Cuántos mensajes ha enviado en ese periodo', fallo: 'Si baja, ha enviado menos mensajes; puede ser por tráfico, revisar otras métricas.' },
  { key: 'ppv_enviados', label: 'PPV Enviados', input: true, indica: 'Cuántos mensajes de venta ha enviado en ese periodo', fallo: 'Si baja, ha enviado menos mensajes de venta; revisar fans y mensajes enviados.' },
  { key: 'ppv_desbloqueados', label: 'PPV Desbloqueados', input: true, indica: 'Cuántos mensajes de venta le compraron en ese periodo', fallo: 'Si baja, le abrieron menos mensajes; revisar fans chateados y Unlock Ratio.' },
  { key: 'golden', label: 'Golden Ratio', calc: true, pct: true, indica: 'De cada cuántos mensajes enviados, cuántos son de venta (PPV enviados ÷ Mensajes enviados)', fallo: 'Si baja, está mandando menos mensajes de venta; revisar miedos o pocas ganas de vender.' },
  { key: 'unlock', label: 'Unlock Ratio', calc: true, pct: true, indica: 'De cada mensaje de venta que envía, cuántos le abren (PPV desbloqueados ÷ PPV enviados)', fallo: 'Si baja, le abren menos mensajes de venta; revisar los PPV que envía, precio, contenido o momento en que los envía.' },
  { key: 'fans_chateados', label: 'Fans Chateados', input: true, indica: 'Con cuántos fans ha chateado en ese periodo', fallo: 'Si baja, habla con menos fans; revisar si es problema de tráfico en las métricas de la cuenta.' },
  { key: 'tiempo_respuesta_seg', label: 'Tiempo de Respuesta', tiempo: true, input: true, inverso: true, indica: 'Tiempo medio de respuesta en los chats. Menos de 5 min es lo óptimo; más de eso es inaceptable', fallo: 'Si sube, es malo: tarda más en responder mensajes.' },
  { key: 'horas_trabajadas', label: 'Horas trabajadas', input: true, dec: 1, indica: 'Cuántas horas ha trabajado en ese periodo', fallo: 'Si baja, trabaja menos días o tiene problemas de luz o internet.' },
  { key: 'precio_medio', label: 'Precio medio PPV', calc: true, unit: '$', dec: 2, indica: 'Media de precios de los mensajes de venta que le compran (Ventas ÷ PPV desbloqueados)', fallo: 'Si baja, vende a menor precio; revisar si la facturación es buena. Si aumentan las ventas pero con menor precio, no está mal.' },
  { key: 'por_fan', label: '$ por Fan Chateado', calc: true, unit: '$', dec: 2, indica: 'Facturación por fan que habla (Ventas ÷ Fans chateados)', fallo: 'Si baja, monetiza menos a los fans que ya hay en la cuenta; revisar cómo habla con fans nuevos y si sigue las guías de venta.' },
  { key: 'msgs_fan', label: 'Mensajes por fan', calc: true, dec: 1, indica: 'Cuántos mensajes envía por fan (Mensajes ÷ Fans chateados)', fallo: 'Si baja, habla menos con los fans y seguramente no fideliza ni vende tanto.' },
  { key: 'por_hora', label: '$ por hora', calc: true, unit: '$', dec: 2, indica: 'Cuánto factura por hora (Ventas ÷ Horas trabajadas)', fallo: 'Si baja, rinde menos en su horario; revisar tiempo de respuesta y ventas realizadas.' },
]
const ENTRADAS = METRICAS.filter((m) => m.input).map((m) => m.key)
const EMPTY_FORM = { week_start: '', notas: '', ...Object.fromEntries(ENTRADAS.map((k) => [k, ''])), tiempo_txt: '' }
const KEYS_TABLA_EQUIPO = ['ventas_total', 'por_hora', 'unlock', 'golden', 'fans_chateados', 'tiempo_respuesta_seg', 'horas_trabajadas']

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const div = (a, b) => (a != null && b ? a / b : null)
function enriquecer(r) {
  const v = (k) => num(r[k])
  return {
    ...r,
    golden: div(v('ppv_enviados'), v('mensajes_enviados')),
    unlock: div(v('ppv_desbloqueados'), v('ppv_enviados')),
    precio_medio: div(v('ventas_total'), v('ppv_desbloqueados')),
    por_fan: div(v('ventas_total'), v('fans_chateados')),
    msgs_fan: div(v('mensajes_enviados'), v('fans_chateados')),
    por_hora: div(v('ventas_total'), v('horas_trabajadas')),
  }
}
function fmtEs(n, dec = 2) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec }) }
function fmtMetrica(m, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (m.tiempo) return segundosATexto(v)
  if (m.pct) return (Number(v) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + '%'
  const t = fmtEs(v, m.dec ?? 2)
  return m.unit === '$' ? '$' + t : t
}
const POR_KEY = Object.fromEntries(METRICAS.map((m) => [m.key, m]))

// Empareja el nombre de cada hoja con un perfil: primero nombre idéntico, luego nombre que lo contenga (si es único)
function emparejar(hojas, perfiles) {
  const usados = new Set()
  const res = hojas.map(() => '')
  hojas.forEach((h, i) => {
    const p = perfiles.find((x) => norm(x.full_name) === norm(h.hoja) && !usados.has(x.id))
    if (p) { res[i] = p.id; usados.add(p.id) }
  })
  hojas.forEach((h, i) => {
    if (res[i]) return
    const cands = perfiles.filter((x) => !usados.has(x.id) && norm(x.full_name).includes(norm(h.hoja)))
    if (cands.length === 1) { res[i] = cands[0].id; usados.add(cands[0].id) }
  })
  return res
}

export default function ChatterMetrics() {
  const { hasAnyRole, profile } = useAuth()
  const canEdit = hasAnyRole(['admin', 'manager'])
  const [chatters, setChatters] = useState([])
  const [stats, setStats] = useState([])
  const [vista, setVista] = useState('chatter') // 'chatter' | 'equipo'
  const [selectedChatter, setSelectedChatter] = useState('')
  const [semanaEquipo, setSemanaEquipo] = useState('')
  const [loading, setLoading] = useState(true)
  const [grafica, setGrafica] = useState('ventas_total')
  const [verGuia, setVerGuia] = useState(false)

  const [panel, setPanel] = useState(null) // 'excel' | 'form' | null
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [imp, setImp] = useState(null) // { archivo, hojas:[{hoja,semanas,chatterId,incluir}], modo }
  const [impBusy, setImpBusy] = useState(false)
  const [impMsg, setImpMsg] = useState('')
  const [impErr, setImpErr] = useState('')

  // capturas de Infloww -> métricas
  const [inf, setInf] = useState(null) // { semana, notas, filas:[{nombre, chatterId, incluir, v:{...}}] }
  const [infBusy, setInfBusy] = useState(false)
  const [infMsg, setInfMsg] = useState('')
  const [infErr, setInfErr] = useState('')
  const [copiado, setCopiado] = useState('')

  const [exportando, setExportando] = useState(false)
  const [informeIA, setInformeIA] = useState(null) // 'chatter' | 'equipo' | null

  async function cargar() {
    setLoading(true)
    const [cs, { data }] = await Promise.all([
      canEdit ? getProfilesByRoles(['chatter', 'manager', 'admin']) : Promise.resolve(profile ? [profile] : []),
      supabase.from('chatter_weekly_stats').select('*').order('week_start', { ascending: true }).limit(5000),
    ])
    const permitidos = new Set(cs.map((c) => c.id))
    setChatters(cs)
    setStats((data || []).filter((r) => !canEdit || permitidos.has(r.chatter_id))) // sin métricas de extrabajadores
    setSelectedChatter((sel) => {
      if (sel) return sel
      const conDatos = cs.find((c) => (data || []).some((r) => r.chatter_id === c.id))
      return (conDatos || cs[0])?.id || ''
    })
    const semanas = [...new Set((data || []).map((r) => r.week_start))].sort()
    setSemanaEquipo((s) => s || semanas[semanas.length - 1] || '')
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const nombreDe = (id) => chatters.find((c) => c.id === id)?.full_name || '—'
  const filas = useMemo(
    () => stats.filter((r) => r.chatter_id === selectedChatter).map(enriquecer),
    [stats, selectedChatter],
  )
  const semanasDisponibles = useMemo(() => [...new Set(stats.map((r) => r.week_start))].sort().reverse(), [stats])
  const filasEquipo = useMemo(
    () => stats.filter((r) => r.week_start === semanaEquipo).map(enriquecer).sort((a, b) => (Number(b.ventas_total) || 0) - (Number(a.ventas_total) || 0)),
    [stats, semanaEquipo],
  )

  // ---------- exportar a Excel (mismo formato que SEGUIMIENTO_CHATTERS.xlsx) ----------
  async function exportar(todos) {
    const ids = todos ? [...new Set(stats.map((r) => r.chatter_id))] : [selectedChatter]
    const fichas = ids
      .map((id) => ({ nombre: nombreDe(id), semanas: stats.filter((r) => r.chatter_id === id) }))
      .filter((f) => f.semanas.length)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    if (!fichas.length) return
    setExportando(true)
    try {
      await exportarFichasChatters(fichas, todos ? 'SEGUIMIENTO_CHATTERS.xlsx' : `SEGUIMIENTO_${fichas[0].nombre.replace(/[^\p{L}\p{N}]+/gu, '_')}.xlsx`)
    } catch (e) {
      alert('No se pudo crear el Excel: ' + (e.message || e))
    }
    setExportando(false)
  }

  // ---------- alta / edición manual ----------
  const semana = form.week_start ? lunesDe(form.week_start) : ''
  const previa = useMemo(() => {
    const f = { ...form, tiempo_respuesta_seg: tiempoASegundos(form.tiempo_txt) }
    return enriquecer(f)
  }, [form])

  function abrirNueva() { setEditId(null); setForm(EMPTY_FORM); setError(null); setPanel('form') }
  function abrirEditar(r) {
    const f = { ...EMPTY_FORM, week_start: r.week_start, notas: r.notas || '' }
    ENTRADAS.forEach((k) => { f[k] = r[k] === null || r[k] === undefined ? '' : String(r[k]) })
    f.tiempo_txt = r.tiempo_respuesta_seg == null ? '' : segundosATexto(r.tiempo_respuesta_seg)
    setEditId(r.id); setForm(f); setError(null); setPanel('form')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cerrarForm() { setPanel(null); setEditId(null); setForm(EMPTY_FORM); setError(null) }

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!form.week_start) { setError('Indica la semana.'); return }
    setGuardando(true)
    const payload = { chatter_id: selectedChatter, week_start: semana, notas: form.notas || null }
    ENTRADAS.forEach((k) => { payload[k] = k === 'tiempo_respuesta_seg' ? tiempoASegundos(form.tiempo_txt) : num(form[k]) })
    const { error: err } = editId
      ? await supabase.from('chatter_weekly_stats').update(payload).eq('id', editId)
      : await supabase.from('chatter_weekly_stats').insert([payload])
    setGuardando(false)
    if (err) { setError(editId ? 'No se pudieron guardar los cambios.' : 'No se pudo guardar. ¿Ya existe esa semana para este chatter? Búscala en la tabla y pulsa Editar. Si es la primera vez, ejecuta la migración 42.'); return }
    cerrarForm(); cargar()
  }
  async function borrar(r) {
    if (!confirm(`¿Eliminar la semana del ${fmtF(r.week_start)} de ${nombreDe(r.chatter_id)}? No se puede deshacer.`)) return
    const { error: err } = await supabase.from('chatter_weekly_stats').delete().eq('id', r.id)
    if (err) { alert('No se pudo eliminar.'); return }
    cargar()
  }

  // ---------- subir Excel ----------
  async function elegirArchivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImpErr(''); setImpMsg(''); setImp(null); setImpBusy(true)
    try {
      const hojas = parsearChatters(await leerLibro(file)).filter((h) => h.semanas.length)
      if (!hojas.length) throw new Error('No he encontrado semanas con datos. Sube el Excel de seguimiento de chatters (una hoja por chatter, con la fila «FECHA» y «Ventas Totales + Subs»).')
      const ids = emparejar(hojas, chatters)
      setImp({
        archivo: file.name,
        modo: 'actualizar',
        hojas: hojas.map((h, i) => ({ ...h, chatterId: ids[i], incluir: !!ids[i] })),
      })
    } catch (err) { setImpErr(err.message || 'No he podido leer el archivo.') }
    setImpBusy(false)
  }
  const claves = useMemo(() => new Set(stats.map((r) => r.chatter_id + '|' + r.week_start)), [stats])
  const repetidos = useMemo(() => {
    if (!imp) return false
    const ids = imp.hojas.filter((h) => h.incluir && h.chatterId).map((h) => h.chatterId)
    return new Set(ids).size !== ids.length
  }, [imp])
  function setHoja(i, cambios) { setImp((s) => ({ ...s, hojas: s.hojas.map((h, j) => (j === i ? { ...h, ...cambios } : h)) })) }

  async function importar() {
    setImpErr(''); setImpMsg(''); setImpBusy(true)
    try {
      const mapa = new Map()
      imp.hojas.filter((h) => h.incluir && h.chatterId).forEach((h) => {
        h.semanas.forEach((s) => {
          const k = h.chatterId + '|' + s.week_start
          if (imp.modo === 'nuevas' && claves.has(k)) return
          mapa.set(k, { chatter_id: h.chatterId, week_start: s.week_start, ...s.valores })
        })
      })
      const lote = [...mapa.values()]
      if (!lote.length) { setImpMsg('No hay semanas nuevas que cargar: todo lo del archivo ya estaba en el CRM.'); setImpBusy(false); return }
      for (let i = 0; i < lote.length; i += 200) {
        const { error: err } = await supabase.from('chatter_weekly_stats').upsert(lote.slice(i, i + 200), { onConflict: 'chatter_id,week_start' })
        if (err) throw new Error(err.message.includes('does not exist') ? 'Falta ejecutar la migración 42 en Supabase.' : err.message)
      }
      const nuevas = lote.filter((r) => !claves.has(r.chatter_id + '|' + r.week_start)).length
      setImpMsg(`Listo: ${lote.length} semanas cargadas (${nuevas} nuevas, ${lote.length - nuevas} actualizadas).`)
      setImp(null)
      await cargar()
    } catch (err) { setImpErr(err.message || 'No se pudo importar.') }
    setImpBusy(false)
  }

  // ---------- copiar todas las métricas de una fila ----------
  function textoMetricas(r) {
    const cab = `${nombreDe(r.chatter_id)} · semana del ${fmtF(r.week_start)}`
    return [cab, ...METRICAS.map((m) => `${m.label}: ${fmtMetrica(m, r[m.key])}`)].join('\n')
  }
  async function copiarFila(r) {
    const t = textoMetricas(r)
    try { await navigator.clipboard.writeText(t) } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopiado(r.id); setTimeout(() => setCopiado((c) => (c === r.id ? '' : c)), 1400)
  }

  // ---------- subir capturas de Infloww ----------
  const CAMPOS_INF = ['ventas_total', 'ventas_ppv', 'propinas', 'mensajes_enviados', 'ppv_enviados', 'ppv_desbloqueados', 'fans_chateados', 'tiempo_respuesta_seg', 'horas_trabajadas']
  async function elegirCapturas(e) {
    const files = Array.from(e.target.files || []).slice(0, 10)
    e.target.value = ''
    if (!files.length) return
    setInfErr(''); setInfMsg(''); setInf(null); setInfBusy(true)
    try {
      const imgs = []
      for (const f of files) imgs.push(await reducirImagen(f))
      const r = await leerEstadisticasInflow(imgs)
      if (!r.chatters.length) throw new Error('No he encontrado filas de chatters en las capturas. Sube una captura de la tabla de estadísticas de empleados de Infloww.')
      const hojas = r.chatters.map((c) => ({ hoja: c.nombre || '' }))
      const ids = emparejar(hojas, chatters)
      const base = r.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_inicio) ? r.fecha_inicio : ''
      setInf({
        semana: base,
        rango: r.fecha_inicio && r.fecha_fin ? `${r.fecha_inicio} → ${r.fecha_fin}` : '',
        notas: r.notas,
        filas: r.chatters.map((c, i) => ({
          nombre: c.nombre, chatterId: ids[i], incluir: !!ids[i],
          v: Object.fromEntries(CAMPOS_INF.map((k) => {
            if (k === 'tiempo_respuesta_seg') return [k, c.tiempo_respuesta ? c.tiempo_respuesta.replace(/\s+/g, '') : '']
            return [k, c[k] === null || c[k] === undefined ? '' : String(c[k])]
          })),
        })),
      })
    } catch (err) { setInfErr(err.message || 'No he podido leer las capturas.') }
    setInfBusy(false)
  }
  function setFilaInf(i, cambios) { setInf((s) => ({ ...s, filas: s.filas.map((f, j) => (j === i ? { ...f, ...cambios } : f)) })) }
  function setValInf(i, k, val) { setInf((s) => ({ ...s, filas: s.filas.map((f, j) => (j === i ? { ...f, v: { ...f.v, [k]: val } } : f)) })) }
  const infRepetidos = useMemo(() => {
    if (!inf) return false
    const ids = inf.filas.filter((f) => f.incluir && f.chatterId).map((f) => f.chatterId)
    return new Set(ids).size !== ids.length
  }, [inf])
  async function volcarInf() {
    setInfErr(''); setInfMsg('')
    if (!inf.semana) { setInfErr('Indica la semana (cualquier día de esa semana).'); return }
    const lunes = lunesDe(inf.semana)
    setInfBusy(true)
    try {
      const lote = inf.filas.filter((f) => f.incluir && f.chatterId).map((f) => {
        const previo = stats.find((r) => r.chatter_id === f.chatterId && r.week_start === lunes) || {}
        const row = { chatter_id: f.chatterId, week_start: lunes }
        CAMPOS_INF.forEach((k) => {
          const nuevo = k === 'tiempo_respuesta_seg' ? tiempoASegundos(f.v[k]) : num(f.v[k])
          row[k] = nuevo !== null && nuevo !== undefined ? nuevo : (previo[k] ?? null) // lo que no se leyó no pisa lo que ya había
        })
        return row
      })
      if (!lote.length) throw new Error('No hay filas seleccionadas con una persona asignada.')
      const { error: err } = await supabase.from('chatter_weekly_stats').upsert(lote, { onConflict: 'chatter_id,week_start' })
      if (err) throw new Error(err.message)
      const nuevas = lote.filter((r) => !claves.has(r.chatter_id + '|' + r.week_start)).length
      setInfMsg(`Listo: ${lote.length} chatters volcados en la semana del ${fmtF(lunes)} (${nuevas} nuevos, ${lote.length - nuevas} actualizados).`)
      setInf(null)
      await cargar()
    } catch (err) { setInfErr(err.message || 'No se pudo volcar.') }
    setInfBusy(false)
  }

  // ---------- análisis IA (informes) ----------
  const metr = (r) => ({
    semana: r.week_start, ventas: r.ventas_total, ventas_ppv: r.ventas_ppv, propinas: r.propinas, mensajes: r.mensajes_enviados,
    ppv_enviados: r.ppv_enviados, ppv_desbloqueados: r.ppv_desbloqueados, golden_ratio: r.golden, unlock_ratio: r.unlock,
    fans_chateados: r.fans_chateados, tiempo_respuesta_seg: r.tiempo_respuesta_seg, tiempo_respuesta: r.tiempo_respuesta_seg == null ? null : segundosATexto(r.tiempo_respuesta_seg),
    horas: r.horas_trabajadas, precio_medio_ppv: r.precio_medio, dolar_por_fan: r.por_fan, mensajes_por_fan: r.msgs_fan, dolar_por_hora: r.por_hora, notas: r.notas,
  })
  const datosChatter = useMemo(() => filas.map(metr), [filas])
  const datosEquipo = useMemo(() => {
    const porChatter = {}
    stats.map(enriquecer).forEach((r) => {
      const n = nombreDe(r.chatter_id)
      ;(porChatter[n] = porChatter[n] || []).push(r)
    })
    return Object.entries(porChatter).map(([chatter, rs]) => ({ chatter, semanas: rs.sort((a, b) => a.week_start.localeCompare(b.week_start)).map(metr) }))
  }, [stats, chatters])

  const mGraf = POR_KEY[grafica]
  const chartData = filas.map((r) => ({ week: fmtF(r.week_start), v: r[grafica] == null ? null : (mGraf.pct ? Number(r[grafica]) * 100 : Number(r[grafica])) }))
  const ultima = filas[filas.length - 1]
  const anterior = filas[filas.length - 2]

  function campo(m) {
    return (
      <div key={m.key}>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{m.label}{m.unit === '$' ? ' ($)' : ''}</label>
        {m.tiempo ? (
          <Input placeholder="ej. 2m37s" value={form.tiempo_txt} onChange={(e) => setForm({ ...form, tiempo_txt: e.target.value })} />
        ) : (
          <Input type="number" step="0.01" value={form[m.key]} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })} />
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Métricas de chatters"
        subtitle="Las mismas métricas de tu Excel de seguimiento de chatters, semana a semana, con análisis automático."
        action={canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => { setPanel(panel === 'inflow' ? null : 'inflow'); setInfErr(''); setInfMsg('') }}>{panel === 'inflow' ? 'Cancelar' : '🖼️ Subir capturas de Inflow'}</Button>
            <Button variant="ghost" onClick={() => { setPanel(panel === 'excel' ? null : 'excel'); setImpErr(''); setImpMsg('') }}>{panel === 'excel' ? 'Cancelar' : '📥 Subir Excel'}</Button>
            <Button variant="ghost" onClick={() => setInformeIA('equipo')} disabled={!stats.length}>✨ Generar análisis del equipo</Button>
            <Button onClick={() => (panel === 'form' ? cerrarForm() : abrirNueva())} disabled={!selectedChatter}>{panel === 'form' ? 'Cancelar' : 'Añadir semana'}</Button>
          </div>
        )}
      />

      {panel === 'inflow' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">Subir capturas de las estadísticas de Inflow</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Sube hasta 10 capturas de la tabla de estadísticas de empleados de Infloww. La IA lee a todos los chatters, te enseña lo que ha leído para que lo revises y lo vuelca en la semana que elijas. Lo que no se vea en las capturas no pisa lo que ya había guardado.
          </p>
          <input type="file" accept="image/*" multiple onChange={elegirCapturas} className="text-sm mb-3 block" disabled={infBusy} />
          {infBusy && !inf && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Leyendo las capturas con la IA…</p>}
          {infErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{infErr}</p>}
          {infMsg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{infMsg}</p>}
          {inf && (
            <div>
              <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Cualquier día de la semana a la que corresponden</label>
                  <Input type="date" value={inf.semana} onChange={(e) => setInf({ ...inf, semana: e.target.value })} />
                </div>
                <p className="text-xs pb-2" style={{ color: 'var(--text-muted)' }}>
                  {inf.semana ? `Se guardará en la semana del lunes ${fmtF(lunesDe(inf.semana))}.` : 'La IA no ha visto la fecha en las capturas: elígela.'}
                  {inf.rango && ` Rango visto en la captura: ${inf.rango}.`}
                </p>
              </div>
              {inf.notas && <p className="text-xs mb-3" style={{ color: 'var(--gold)' }}>⚠ {inf.notas}</p>}
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th />
                      <th className="text-left px-2 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Leído</th>
                      <th className="text-left px-2 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Chatter del CRM</th>
                      {CAMPOS_INF.map((k) => <th key={k} className="text-left px-2 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{POR_KEY[k].label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {inf.filas.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: f.incluir ? 1 : 0.5 }}>
                        <td className="px-2 py-2"><input type="checkbox" checked={f.incluir} onChange={(e) => setFilaInf(i, { incluir: e.target.checked })} /></td>
                        <td className="px-2 py-2 whitespace-nowrap">{f.nombre}</td>
                        <td className="px-2 py-2 min-w-[160px]">
                          <Select value={f.chatterId} onChange={(e) => setFilaInf(i, { chatterId: e.target.value, incluir: !!e.target.value })}>
                            <option value="">— Elegir —</option>
                            {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                          </Select>
                        </td>
                        {CAMPOS_INF.map((k) => (
                          <td key={k} className="px-2 py-2"><Input style={{ minWidth: 84 }} value={f.v[k]} onChange={(e) => setValInf(i, k, e.target.value)} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {infRepetidos && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>Has asignado a la misma persona en dos filas. Cada fila debe ir a un chatter distinto (o desmarca una).</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={volcarInf} disabled={infBusy || infRepetidos || !inf.filas.some((f) => f.incluir && f.chatterId)}>{infBusy ? 'Volcando…' : 'Volcar en el CRM'}</Button>
                <Button variant="ghost" onClick={() => setInf(null)} disabled={infBusy}>Descartar</Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {panel === 'excel' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">Subir el Excel de seguimiento de chatters</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Sube el archivo .xlsx tal cual lo usas (una hoja por chatter, con las fechas en la fila «FECHA»). El CRM lee todas las semanas, te las enseña para que las revises y las vuelca. Las fórmulas del Excel no hacen falta: el CRM calcula los ratios solo. Puedes volver a subir el mismo archivo cada semana, no duplica nada.
          </p>
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={elegirArchivo} className="text-sm mb-3 block" disabled={impBusy} />
          {impBusy && !imp && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Leyendo el archivo…</p>}
          {impErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{impErr}</p>}
          {impMsg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{impMsg}</p>}

          {imp && (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Archivo: {imp.archivo}. Elige a qué persona del CRM corresponde cada hoja.</p>
              <div className="space-y-2 mb-4">
                {imp.hojas.map((h, i) => {
                  const nuevas = h.chatterId ? h.semanas.filter((s) => !claves.has(h.chatterId + '|' + s.week_start)).length : h.semanas.length
                  return (
                    <div key={i} className="p-3 rounded-md grid grid-cols-1 md:grid-cols-[auto_1fr_1.2fr] gap-3 items-center" style={{ background: 'var(--panel-alt)', opacity: h.incluir ? 1 : 0.55 }}>
                      <input type="checkbox" checked={h.incluir} onChange={(e) => setHoja(i, { incluir: e.target.checked })} />
                      <div>
                        <p className="text-sm font-medium">Hoja «{h.hoja}»</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {h.semanas.length} semanas · {fmtF(h.semanas[0].week_start)} → {fmtF(h.semanas[h.semanas.length - 1].week_start)}
                          {h.chatterId && ` · ${nuevas} nuevas, ${h.semanas.length - nuevas} ya existen`}
                        </p>
                      </div>
                      <Select value={h.chatterId} onChange={(e) => setHoja(i, { chatterId: e.target.value, incluir: !!e.target.value })}>
                        <option value="">— Elegir persona —</option>
                        {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                      </Select>
                    </div>
                  )
                })}
              </div>
              {repetidos && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>Has elegido a la misma persona en dos hojas. Cada hoja debe ir a una persona distinta (o desmarca una).</p>}
              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={imp.modo === 'actualizar'} onChange={() => setImp({ ...imp, modo: 'actualizar' })} /> Cargar todo y actualizar lo que ya existe</label>
                <label className="flex items-center gap-2"><input type="radio" checked={imp.modo === 'nuevas'} onChange={() => setImp({ ...imp, modo: 'nuevas' })} /> Solo añadir semanas nuevas (no tocar lo existente)</label>
              </div>
              <div className="flex gap-2">
                <Button onClick={importar} disabled={impBusy || repetidos || !imp.hojas.some((h) => h.incluir && h.chatterId)}>{impBusy ? 'Cargando…' : 'Cargar en el CRM'}</Button>
                <Button variant="ghost" onClick={() => setImp(null)} disabled={impBusy}>Descartar</Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {panel === 'form' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">{editId ? 'Editar semana' : 'Nueva semana'} · {nombreDe(selectedChatter)}</p>
          <form onSubmit={guardar}>
            <div className="mb-3 max-w-xs">
              <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Cualquier día de la semana que describe el informe</label>
              <Input type="date" value={form.week_start} onChange={(e) => setForm({ ...form, week_start: e.target.value })} required />
              {semana && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Se guardará como la semana del lunes {fmtF(semana)}.</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">{METRICAS.filter((m) => m.input).map(campo)}</div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Se calculan solas:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {METRICAS.filter((m) => m.calc).map((m) => (
                <div key={m.key}>
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>{m.label}</label>
                  <div className="px-3 py-2 rounded-md text-sm tabular-nums" style={{ background: 'var(--panel-alt)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>{fmtMetrica(m, previa[m.key])}</div>
                </div>
              ))}
            </div>
            <div className="mb-3"><Input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
            {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar semana'}</Button>
          </form>
        </Panel>
      )}

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {[['chatter', 'Por chatter'], ['equipo', 'Equipo por semana']].map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)} className="px-4 py-2 text-sm" style={{ background: vista === k ? 'var(--accent-soft)' : 'transparent', color: vista === k ? 'var(--accent)' : 'var(--text-muted)' }}>{t}</button>
          ))}
        </div>
        {vista === 'chatter' ? (
          canEdit && (
            <div className="min-w-[200px]">
              <Select value={selectedChatter} onChange={(e) => setSelectedChatter(e.target.value)}>
                {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </Select>
            </div>
          )
        ) : (
          <div className="min-w-[200px]">
            <Select value={semanaEquipo} onChange={(e) => setSemanaEquipo(e.target.value)}>
              {semanasDisponibles.map((s) => <option key={s} value={s}>Semana del {fmtF(s)}</option>)}
            </Select>
          </div>
        )}
        {canEdit && vista === 'chatter' && (
          <>
            <Button variant="ghost" onClick={() => exportar(false)} disabled={exportando || !filas.length}>{exportando ? 'Creando Excel…' : '⬇ Exportar ficha (Excel)'}</Button>
            <Button variant="ghost" onClick={() => exportar(true)} disabled={exportando || !stats.length}>⬇ Exportar todos (una hoja por chatter)</Button>
          </>
        )}
        <button className="text-sm underline ml-auto" style={{ color: 'var(--text-muted)' }} onClick={() => setVerGuia(!verGuia)}>{verGuia ? 'Ocultar guía de métricas' : 'Qué significa cada métrica'}</button>
      </div>

      {verGuia && (
        <Panel className="p-5 mb-6">
          <div className="space-y-3">
            {METRICAS.map((m) => (
              <div key={m.key}>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.indica}</p>
                {m.fallo && <p className="text-xs" style={{ color: 'var(--gold)' }}>⚠ {m.fallo}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {loading ? (
        <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p></Panel>
      ) : vista === 'equipo' ? (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Chatter</th>
                {KEYS_TABLA_EQUIPO.map((k) => <th key={k} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{POR_KEY[k].label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filasEquipo.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No hay datos de esa semana.</td></tr>}
              {filasEquipo.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <button className="text-xs underline mr-3 font-normal" title="Copiar todas las métricas de esta fila" onClick={() => copiarFila(r)}>{copiado === r.id ? '✓ Copiado' : '📋 Copiar'}</button>
                    {nombreDe(r.chatter_id)}
                  </td>
                  {KEYS_TABLA_EQUIPO.map((k) => <td key={k} className="px-4 py-3 tabular-nums whitespace-nowrap">{fmtMetrica(POR_KEY[k], r[k])}</td>)}
                </tr>
              ))}
              {filasEquipo.length > 1 && (
                <tr>
                  <td className="px-4 py-3 font-medium">Total equipo</td>
                  <td className="px-4 py-3 font-medium tabular-nums">${fmtEs(filasEquipo.reduce((a, r) => a + (Number(r.ventas_total) || 0), 0))}</td>
                  <td colSpan={5} />
                  <td className="px-4 py-3 tabular-nums">{fmtEs(filasEquipo.reduce((a, r) => a + (Number(r.horas_trabajadas) || 0), 0), 1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      ) : (
        <>
          {filas.length === 0 ? (
            <Panel><p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>{nombreDe(selectedChatter)} todavía no tiene semanas cargadas.{canEdit ? ' Usa «Subir Excel» o «Añadir semana».' : ''}</p></Panel>
          ) : (
            <>
              {ultima && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {['ventas_total', 'por_hora', 'unlock', 'tiempo_respuesta_seg'].map((k) => {
                    const m = POR_KEY[k]
                    return (
                      <Panel key={k} className="p-4">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{m.label} · sem. {fmtF(ultima.week_start)}</p>
                        <p className="font-display text-xl font-semibold tabular-nums">{fmtMetrica(m, ultima[k])}</p>
                        {anterior && !m.inverso && <DeltaBadge actual={ultima[k]} anterior={anterior[k]} />}
                        {anterior && m.inverso && <DeltaBadge actual={anterior[k]} anterior={ultima[k]} />}
                      </Panel>
                    )
                  })}
                </div>
              )}

              <Panel className="p-5 mb-6">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div className="min-w-[200px]">
                    <Select value={grafica} onChange={(e) => setGrafica(e.target.value)}>
                      {METRICAS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </Select>
                  </div>
                  <Button onClick={() => setInformeIA('chatter')} disabled={!filas.length}>✨ Generar análisis por IA</Button>
                </div>
                {chartData.length > 1 && (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => (mGraf.tiempo ? segundosATexto(v) : mGraf.pct ? fmtEs(v) + '%' : fmtEs(v))} />
                      <Line type="monotone" dataKey="v" name={mGraf.label} stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Panel>

              <Panel className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Semana</th>
                      {METRICAS.map((m) => <th key={m.key} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{m.label}</th>)}
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {[...filas].reverse().map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button className="text-xs underline mr-3" title="Copiar todas las métricas de esta fila" onClick={() => copiarFila(r)}>{copiado === r.id ? '✓ Copiado' : '📋 Copiar'}</button>
                          {fmtF(r.week_start)}
                        </td>
                        {METRICAS.map((m) => <td key={m.key} className="px-4 py-3 tabular-nums whitespace-nowrap" style={m.calc ? { color: 'var(--text-muted)' } : undefined}>{fmtMetrica(m, r[m.key])}</td>)}
                        {canEdit && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button className="text-xs underline mr-3" onClick={() => abrirEditar(r)}>Editar</button>
                            <button className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => borrar(r)}>Borrar</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </>
          )}
        </>
      )}
      {informeIA === 'chatter' && (
        <InformeIAModal ambito="chatter" chatterId={selectedChatter} chatterNombre={nombreDe(selectedChatter)} datos={datosChatter} equipo={datosEquipo} onClose={() => setInformeIA(null)} />
      )}
      {informeIA === 'equipo' && (
        <InformeIAModal ambito="equipo" datos={datosEquipo} onClose={() => setInformeIA(null)} />
      )}
    </div>
  )
}
