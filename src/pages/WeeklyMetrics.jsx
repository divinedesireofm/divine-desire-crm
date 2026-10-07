import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, PageHeader, DeltaBadge } from '../components/ui'
import { iaCallJSON, getVoiceGuide, withVoiceGuide } from '../lib/ai'
import { leerLibro, parsearModelo } from '../lib/excelImport'

const REGLAS_ANALISIS = `Eres el analista de métricas semanales de la agencia Divine Desire (gestión de creadoras de OnlyFans). Analizas los datos de Infloww (chat) y OFM PRO (Instagram) exactamente como lo haría un analista senior del sector. Sigue SIEMPRE estas reglas aprendidas, son innegociables:

1. LA REGLA DEL EMBUDO: si visitas, subs nuevas y facturación no se mueven en la misma dirección y orden de magnitud, sospecha primero de una métrica rota (ej. contador de visitas de OnlyFans, que se rompe con frecuencia) antes de sacar conclusiones de negocio. Una conversión visitas→subs superior al 3% suele ser imposible; si aparece, el denominador (visitas) está mal, no es una mejora real.
2. NUNCA recomiendes bajar precios de PPV — reduce ingresos sin mejorar la tasa de desbloqueo. Si algo hay que hacer con precios, es subirlos cuando el mercado lo aguante.
3. Los tips como % de la facturación son el termómetro de la conexión emocional con los fans. Objetivo sano: >8%. Por debajo de 3% es una señal de alarma de calidad de chat, no solo de volumen.
4. Si el ARPU (ingreso medio por fan) sube mientras la facturación total baja, es una señal de CONTRACCIÓN (la base de fans se está reduciendo), no de mejora — no lo confundas con una buena noticia.
5. El modelo de suscripción gratuita desmonta el pipeline de renovaciones con el tiempo — es una palanca de captación puntual, nunca una estrategia permanente. Si lleva varias semanas activa, avisa del riesgo.
6. Cuando falten datos de una semana o parezcan inconsistentes con las anteriores, dilo explícitamente en vez de inventar una explicación de negocio.
7. Sé directo y concreto, sin relleno. Estructura pensada para que se lea en 30 segundos y se entienda en detalle si hace falta profundizar.
8. "Fans activos" y "días suscritos" son una FOTO de un momento (stock): no los sumes entre semanas, compáralos semana a semana. "Subs nuevas", "renovaciones" y "facturación" sí son flujo y se pueden sumar en un periodo.

Leyenda de los campos del histórico (mismas métricas que el Excel de seguimiento de la agencia): billing_total = Fac. cuenta (facturación bruta de la cuenta); subscription_income = Suscripciones (facturación bruta de suscripciones); chat_ratio = Rat. subs/mensajes (facturación de la cuenta / suscripciones, ratio de chatting); of_profile_visits = Visitas al perfil; renewals_count = Renovaciones; of_subs_new = Subs nuevas; conversion_pct = Rat. Vis/Subs (% de visitantes que se suscriben); income_per_visit = $ por visita; renewal_income = $ Renovaciones; renewal_activated_count = Fans con renovación activada; active_fans = Fans activos; arppu = $ x Spender; arpu = $ x Fan; avg_days_subscribed = Días suscritos (óptimo 30); ig_followers_total = Seguidores de Instagram; ig_new_followers = seguidores nuevos respecto a la semana anterior con dato; ig_avg_likes / ig_avg_comments / ig_avg_views = medias por publicación; ig_engagement_pct y ig_views_ratio = fracciones sobre seguidores (0.04 = 4%). Los valores null son datos que no se registraron esa semana, no ceros.`


// ---------------------------------------------------------------------------
// Las mismas métricas que el Excel de seguimiento. "in" = se escribe a mano.
// "calc" = se calcula sola con la misma fórmula que el Excel.
// ---------------------------------------------------------------------------
const OF = [
  { key: 'billing_total', label: 'Fac. cuenta', unit: '$', indica: 'Facturación bruta de la cuenta', fallo: 'Si baja, la facturación de la cuenta está cayendo.' },
  { key: 'subscription_income', label: 'Suscripciones', unit: '$', indica: 'Facturación bruta de las suscripciones', fallo: 'Si baja, hay menos suscripciones: a veces es el tráfico y a veces un problema del funnel.' },
  { key: 'chat_ratio', label: 'Rat. subs/mensajes', calc: true, dec: 2, indica: 'Ratio de chatting (Fac. cuenta ÷ Suscripciones)', fallo: 'Si baja, se vende menos con la cantidad de suscriptores que hay en la cuenta.' },
  { key: 'of_profile_visits', label: 'Visitas al perfil', indica: 'Personas que llegaron al perfil, se suscribieran o no', fallo: 'Si baja, está fallando el tráfico.' },
  { key: 'renewals_count', label: 'Renovaciones', indica: 'Personas que renovaron', fallo: 'Si baja, la gente no renueva: problema de fidelización.' },
  { key: 'of_subs_new', label: 'Subs nuevas', indica: 'Fans nuevos', fallo: 'Si baja, se suscribe menos gente.' },
  { key: 'conversion_pct', label: 'Rat. Vis/Subs', calc: true, unit: '%', dec: 2, indica: 'De las personas que visitan el perfil, cuántas se suscriben (Subs nuevas ÷ Visitas × 100)', fallo: 'Si baja, pasa algo en el perfil: revisar perfil, oferta y posts públicos.' },
  { key: 'income_per_visit', label: '$ por visita', calc: true, unit: '$', dec: 3, indica: 'Dinero por cada persona que visita el perfil (Fac. cuenta ÷ Visitas)', fallo: 'Si baja, se monetiza menos la audiencia que llega: mirar suscripciones y venta a fans.' },
  { key: 'renewal_income', label: '$ Renovaciones', unit: '$', indica: 'Facturación bruta de las renovaciones', fallo: 'Si baja, menos gente cobra renovación automática: problema de fidelización.' },
  { key: 'renewal_activated_count', label: 'Fans con renovación activada', indica: 'Cuántas personas tienen activada la renovación', fallo: 'Si baja, pocos fans ven interés en mantenerse: calidad de posts, lives, regalos por quedarse.' },
  { key: 'active_fans', label: 'Fans activos', indica: 'Cuántos fans han hecho alguna interacción en el perfil', fallo: 'Si baja, menos gente interactúa: venta agresiva, malos masivos, precios...' },
  { key: 'arppu', label: '$ x Spender', unit: '$', indica: 'Dinero por cada persona que gasta', fallo: 'Si baja, los que gastan gastan menos: revisar precios, scripts, packs.' },
  { key: 'arpu', label: '$ x Fan', unit: '$', indica: 'Dinero por cada fan suscrito, pague o no (media global)', fallo: 'Si baja, cae la monetización de los fans.' },
  { key: 'avg_days_subscribed', label: 'Días suscritos', indica: 'Cuántos días de media duran los fans suscritos (fidelización)', fallo: 'Si baja, a los X días dejan de ver atractivo el perfil. Óptimo: 30.' },
]
const IG = [
  { key: 'ig_followers_total', label: 'Seguidores', indica: 'Seguidores de la cuenta de Instagram', fallo: 'Si baja, el perfil interesa menos: revisar contenido e interacción.' },
  { key: 'ig_new_followers', label: 'Seguidores nuevos', calc: true, indica: 'Diferencia con la última semana que tenga dato de seguidores', fallo: '' },
  { key: 'ig_avg_likes', label: 'Media likes', indica: 'Likes medios por publicación', fallo: 'Si baja, tus posts gustan menos o no hay incentivo para dar like.' },
  { key: 'ig_avg_comments', label: 'Media comentarios', indica: 'Comentarios medios por publicación', fallo: 'Si baja, el contenido no es interactivo: usa encuestas, opciones o premios por comentar.' },
  { key: 'ig_engagement_pct', label: 'Engagement', calc: true, pct: true, indica: '(Media likes + Media comentarios) ÷ Seguidores', fallo: 'Si baja, la interacción de la cuenta no es buena.' },
  { key: 'ig_avg_views', label: 'Media vistas', indica: 'Vistas medias por publicación', fallo: 'Si baja, el contenido aburre o baja de calidad: revisar grabación, edición y contenido.' },
  { key: 'ig_views_ratio', label: 'Ratio de vistas', calc: true, pct: true, indica: 'Media vistas ÷ Seguidores', fallo: 'Si baja, cada vez ven menos personas tus posts.' },
]
const EXTRAS = [
  ['of_net_sales', 'Ingresos netos ($, tras comisión OF)'], ['of_subs_churned', 'Bajas'], ['of_ppv_sent', 'PPV enviados'],
  ['of_ppv_purchased', 'PPV comprados'], ['of_tips', 'Tips ($)'], ['ig_reach', 'Alcance IG'],
  ['ig_profile_visits', 'Visitas al perfil IG'], ['ig_link_clicks', 'Clics al link'],
]
const ENTRADAS = [...OF, ...IG].filter((m) => !m.calc).map((m) => m.key)
const CALCULADAS = [...OF, ...IG].filter((m) => m.calc).map((m) => m.key)
const TODAS = [...OF, ...IG]
const CAMPOS_FORM = [...ENTRADAS, ...EXTRAS.map((e) => e[0])]
const EMPTY_FORM = { week_start: '', fecha_informe: '', notas: '', ...Object.fromEntries(CAMPOS_FORM.map((k) => [k, ''])) }

// El orden de las filas en el Excel (columna de una semana): filas 4 a 17 de OnlyFans y 21 a 26 de Instagram
const ORDEN_EXCEL_OF = OF.map((m) => m.key)
const ORDEN_EXCEL_IG = ['ig_followers_total', 'ig_avg_likes', 'ig_avg_comments', 'ig_engagement_pct', 'ig_avg_views', 'ig_views_ratio']

const GRAFICAS = [
  ['billing_total', 'Fac. cuenta ($)'], ['subscription_income', 'Suscripciones ($)'], ['of_profile_visits', 'Visitas al perfil'],
  ['of_subs_new', 'Subs nuevas'], ['renewals_count', 'Renovaciones'], ['active_fans', 'Fans activos'],
  ['arppu', '$ x Spender'], ['arpu', '$ x Fan'], ['avg_days_subscribed', 'Días suscritos'], ['ig_followers_total', 'Seguidores IG'],
]

const CAMPOS_IMPORTABLES = [...ENTRADAS, ...CALCULADAS.filter((k) => k !== 'ig_new_followers'), ...EXTRAS.map((e) => e[0])]

// ---- utilidades de fecha ----
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
function aFecha(isoStr) { const [y, m, d] = isoStr.split('-').map(Number); return new Date(y, m - 1, d) }
function lunesDe(isoStr) { const d = aFecha(isoStr); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d) }
function semanaDeInforme(isoStr) { const d = aFecha(isoStr); d.setDate(d.getDate() - 7); return lunesDe(iso(d)) }
function fmtF(isoStr) { if (!isoStr) return ''; const [y, m, d] = isoStr.slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }
function finSemana(isoStr) { const d = aFecha(isoStr); d.setDate(d.getDate() + 6); return iso(d) }

function fmtEs(n, dec = 2) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec }) }
function fmtMetrica(m, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (m.pct) return (Number(v) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + '%'
  const t = fmtEs(v, m.dec ?? 2)
  return m.unit === '$' ? '$' + t : m.unit === '%' ? t + '%' : t
}
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// Mismas fórmulas que el Excel
function calcular(f, anteriores, semana) {
  const n = (k) => num(f[k])
  const fac = n('billing_total'), sus = n('subscription_income'), vis = n('of_profile_visits'), nuevas = n('of_subs_new')
  const seg = n('ig_followers_total'), lk = n('ig_avg_likes'), cm = n('ig_avg_comments'), vw = n('ig_avg_views')
  const prev = anteriores.filter((m) => m.week_start < semana && m.ig_followers_total != null).slice(-1)[0]
  return {
    chat_ratio: fac != null && sus ? fac / sus : null,
    conversion_pct: nuevas != null && vis ? (nuevas / vis) * 100 : null,
    income_per_visit: fac != null && vis ? fac / vis : null,
    ig_engagement_pct: seg && (lk != null || cm != null) ? ((lk || 0) + (cm || 0)) / seg : null,
    ig_views_ratio: seg && vw != null ? vw / seg : null,
    ig_new_followers: seg != null && prev ? seg - Number(prev.ig_followers_total) : null,
  }
}

// "1.234,5" -> 1234.5 ; "0,23%" -> 0.23 ; "#DIV/0!" o vacío -> null
function leerNumero(txt) {
  let t = String(txt ?? '').trim().replace('%', '').replace('$', '').replace('€', '').trim()
  if (!t || t.startsWith('#')) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}
const esFecha = (t) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t)
function fechaDeTexto(t) {
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const [d, m, y] = t.split('/').map(Number)
  return `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function WeeklyMetrics() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [grafica, setGrafica] = useState('billing_total')
  const [verGuia, setVerGuia] = useState(false)

  const [analisis, setAnalisis] = useState(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErr, setIaErr] = useState('')

  const [panel, setPanel] = useState(null) // 'ia' | 'excel' | null
  const [importText, setImportText] = useState('')
  const [importImage, setImportImage] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importErr, setImportErr] = useState('')
  const [excelText, setExcelText] = useState('')
  const [excelMsg, setExcelMsg] = useState('')

  // subir el .xlsx completo
  const [arch, setArch] = useState(null) // { nombre, hoja, semanas, modo }
  const [archBusy, setArchBusy] = useState(false)
  const [archMsg, setArchMsg] = useState('')
  const [archErr, setArchErr] = useState('')

  async function loadModels() {
    const { data } = await supabase.from('models').select('id, stage_name').order('stage_name')
    setModels(data || [])
    if (data?.length && !selectedModel) setSelectedModel(data[0].id)
  }
  async function loadMetrics(modelId) {
    if (!modelId) return
    setLoading(true)
    const { data } = await supabase.from('weekly_metrics').select('*').eq('model_id', modelId).order('week_start', { ascending: true }).limit(1000)
    setMetrics(data || [])
    setLoading(false)
    setAnalisis(null)
  }
  useEffect(() => { loadModels() }, [])
  useEffect(() => { loadMetrics(selectedModel) }, [selectedModel])

  const nombreModelo = models.find((m) => m.id === selectedModel)?.stage_name || 'la modelo'
  const semana = form.week_start ? lunesDe(form.week_start) : ''
  const calculadas = useMemo(
    () => calcular(form, metrics.filter((m) => m.id !== editId), semana || '9999-12-31'),
    [form, metrics, editId, semana],
  )

  function abrirNueva() {
    setEditId(null); setForm(EMPTY_FORM); setError(null); setShowForm(true); setPanel(null)
  }
  function abrirEditar(m) {
    const f = { ...EMPTY_FORM, week_start: m.week_start, notas: m.notas || '' }
    CAMPOS_FORM.forEach((k) => { f[k] = m[k] === null || m[k] === undefined ? '' : String(m[k]) })
    setEditId(m.id); setForm(f); setError(null); setShowForm(true); setPanel(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cerrarForm() { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); setError(null) }

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    if (!form.week_start) { setError('Indica la semana.'); return }
    setGuardando(true)
    const payload = { model_id: selectedModel, week_start: semana, notas: form.notas || null }
    CAMPOS_FORM.forEach((k) => { payload[k] = num(form[k]) })
    const c = calcular(form, metrics.filter((m) => m.id !== editId), semana)
    CALCULADAS.forEach((k) => { payload[k] = c[k] })
    const { error: err } = editId
      ? await supabase.from('weekly_metrics').update(payload).eq('id', editId)
      : await supabase.from('weekly_metrics').insert([payload])
    setGuardando(false)
    if (err) {
      setError(editId
        ? 'No se pudieron guardar los cambios. Si es la primera vez que editas, ejecuta la migración 41.'
        : 'No se pudo guardar. ¿Ya existe una entrada para esa semana y esa modelo? Búscala en la tabla y pulsa Editar.')
      return
    }
    cerrarForm()
    loadMetrics(selectedModel)
  }

  async function borrar(m) {
    if (!confirm(`¿Eliminar la semana del ${fmtF(m.week_start)}? No se puede deshacer.`)) return
    const { error: err } = await supabase.from('weekly_metrics').delete().eq('id', m.id)
    if (err) { alert('No se pudo eliminar. Si es la primera vez, ejecuta la migración 41.'); return }
    loadMetrics(selectedModel)
  }

  // ---- pegar una columna del Excel ----
  function aplicarExcel() {
    setExcelMsg('')
    let t = excelText.replace(/\r/g, '').split('\n').map((x) => x.trim())
    while (t.length && t[t.length - 1] === '') t.pop()
    let fechaInf = null
    if (t.length && esFecha(t[0])) { fechaInf = fechaDeTexto(t[0]); t = t.slice(1) }
    if (t.length !== 14 && t.length !== 23) {
      setExcelMsg(`He encontrado ${t.length} valores y esperaba 14 (OnlyFans, filas 4 a 17 del Excel) o 23 (hasta la fila 26, con Instagram). Copia la columna de una sola semana, incluyendo las celdas vacías.`)
      return
    }
    const nf = { ...EMPTY_FORM, notas: form.notas }
    ORDEN_EXCEL_OF.forEach((k, i) => { if (!CALCULADAS.includes(k)) { const v = leerNumero(t[i]); nf[k] = v === null ? '' : String(v) } })
    if (t.length === 23) {
      // filas 18 y 19 vacías, 20 = fecha de Instagram, 21 a 26 = métricas
      ORDEN_EXCEL_IG.forEach((k, i) => { if (!CALCULADAS.includes(k)) { const v = leerNumero(t[17 + i]); nf[k] = v === null ? '' : String(v) } })
    }
    EXTRAS.forEach(([k]) => { nf[k] = form[k] || '' })
    if (fechaInf) { nf.fecha_informe = fechaInf; nf.week_start = semanaDeInforme(fechaInf) } else nf.week_start = form.week_start
    setForm(nf); setEditId(null); setShowForm(true); setPanel(null); setExcelText('')
  }

  // ---- subir el Excel completo de una modelo ----
  async function elegirArchivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setArchErr(''); setArchMsg(''); setArch(null); setArchBusy(true)
    try {
      const hojas = parsearModelo(await leerLibro(file)).filter((h) => h.semanas.length)
      if (!hojas.length) throw new Error('No he encontrado semanas con datos. Sube el Excel de seguimiento de la modelo (fila «FECHA» y filas «Fac. cuenta», «Suscripciones»…).')
      setArch({ nombre: file.name, hoja: hojas[0].hoja, semanas: hojas[0].semanas, modo: 'actualizar' })
    } catch (err) { setArchErr(err.message || 'No he podido leer el archivo.') }
    setArchBusy(false)
  }

  async function importarArchivo() {
    setArchErr(''); setArchMsg(''); setArchBusy(true)
    try {
      const existentes = new Set(metrics.map((m) => m.week_start))
      const orden = [...arch.semanas].sort((a, b) => a.week_start.localeCompare(b.week_start))
      const previos = metrics.map((m) => ({ week_start: m.week_start, ig_followers_total: m.ig_followers_total }))
      const lote = []
      for (const sm of orden) {
        if (arch.modo === 'nuevas' && existentes.has(sm.week_start)) continue
        const c = calcular(sm.valores, previos.filter((p) => p.week_start !== sm.week_start), sm.week_start)
        const fila = { ...sm.valores, ...c }
        const payload = { model_id: selectedModel, week_start: sm.week_start }
        // lo que el Excel trae vacío no pisa lo que ya hubiera en el CRM
        Object.entries(fila).forEach(([k, v]) => { if (v !== null && v !== undefined) payload[k] = v })
        lote.push(payload)
        const i = previos.findIndex((p) => p.week_start === sm.week_start)
        if (i >= 0) previos.splice(i, 1)
        previos.push({ week_start: sm.week_start, ig_followers_total: sm.valores.ig_followers_total })
        previos.sort((a, b) => a.week_start.localeCompare(b.week_start))
      }
      if (!lote.length) { setArchMsg('No hay semanas nuevas que cargar: todo lo del archivo ya estaba en el CRM.'); setArchBusy(false); return }
      for (let i = 0; i < lote.length; i += 100) {
        const { error: err } = await supabase.from('weekly_metrics').upsert(lote.slice(i, i + 100), { onConflict: 'model_id,week_start' })
        if (err) throw new Error(err.message.includes('row-level') ? 'Falta ejecutar la migración 41 en Supabase (permisos de administrador).' : err.message)
      }
      const nuevas = lote.filter((r) => !existentes.has(r.week_start)).length
      setArchMsg(`Listo: ${lote.length} semanas cargadas en ${nombreModelo} (${nuevas} nuevas, ${lote.length - nuevas} actualizadas).`)
      setArch(null)
      await loadMetrics(selectedModel)
    } catch (err) { setArchErr(err.message || 'No se pudo importar.') }
    setArchBusy(false)
  }

  function handlePasteImagen(e) {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    const reader = new FileReader()
    reader.onload = () => setImportImage({ mediaType: file.type, base64: reader.result.split(',')[1] })
    reader.readAsDataURL(file)
  }

  async function extraerConIA() {
    if (!importText.trim() && !importImage) { setImportErr('Pega el texto o la captura con los datos de la semana.'); return }
    setImportBusy(true); setImportErr('')
    try {
      const contenido = []
      if (importImage) contenido.push({ type: 'image', source: { type: 'base64', media_type: importImage.mediaType, data: importImage.base64 } })
      contenido.push({ type: 'text', text: importText.trim() || 'Extrae los datos de la captura.' })
      const system = `Eres experto en leer informes de Infloww (chat de OnlyFans) y OFM PRO (Instagram) de agencias de creadoras. Te van a pasar una captura de pantalla y/o un texto con las métricas de UNA semana. Extrae los valores EXACTOS que veas, nunca inventes ni redondees de más. Si un dato no aparece, devuélvelo como null, no como 0. Si ves una fecha de la semana, conviértela a formato YYYY-MM-DD (lunes de esa semana); si no la ves, devuelve week_start como null. Equivalencias: billing_total = Fac. cuenta; subscription_income = Suscripciones; of_profile_visits = Visitas al perfil; renewals_count = Renovaciones; of_subs_new = Subs nuevas; renewal_income = $ Renovaciones; renewal_activated_count = Fans con renovación activada; active_fans = Fans activos; arppu = $ x Spender; arpu = $ x Fan; avg_days_subscribed = Días suscritos.`
      const schema = {
        type: 'object',
        properties: {
          week_start: { type: ['string', 'null'], description: 'YYYY-MM-DD, lunes de la semana, o null si no aparece' },
          ...Object.fromEntries(ENTRADAS.concat(EXTRAS.map((e) => e[0])).map((c) => [c, { type: ['number', 'null'] }])),
        },
        required: ['week_start', ...ENTRADAS, ...EXTRAS.map((e) => e[0])],
      }
      const extraido = await iaCallJSON(system, [{ role: 'user', content: contenido }], {
        tool_name: 'entregar_metricas', tool_description: 'Entrega las métricas extraídas.', schema,
      }, 1400)
      const nf = { ...EMPTY_FORM }
      if (extraido.week_start) nf.week_start = lunesDe(extraido.week_start)
      ENTRADAS.concat(EXTRAS.map((e) => e[0])).forEach((c) => { if (extraido[c] !== null && extraido[c] !== undefined) nf[c] = String(extraido[c]) })
      setForm(nf); setEditId(null); setPanel(null); setShowForm(true)
      setImportText(''); setImportImage(null)
    } catch (e) { setImportErr(e.message) }
    setImportBusy(false)
  }

  async function generarAnalisis() {
    setIaBusy(true); setIaErr(''); setAnalisis(null)
    try {
      const modeloNombre = models.find((m) => m.id === selectedModel)?.stage_name || ''
      const limpio = (m) => Object.fromEntries(Object.entries(m).filter(([k, v]) => v !== null && !['id', 'model_id', 'created_at', 'updated_at'].includes(k)))
      const ultimas = metrics.slice(-10).map(limpio)
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(REGLAS_ANALISIS + `\n\nAntes de afirmar que algo es un problema, pregúntate si hay otra explicación posible (un dato roto, una semana atípica, una campaña puntual). Si hay más de una explicación razonable, dilo como pregunta abierta en vez de darla por hecho.`, guia)
      const analisisObj = await iaCallJSON(system, [{ role: 'user', content: `Modelo: ${modeloNombre}\n\nHistórico de las últimas semanas (la última fila es la semana a analizar):\n${JSON.stringify(ultimas)}` }], {
        tool_name: 'entregar_analisis',
        tool_description: 'Entrega el análisis de la semana.',
        schema: {
          type: 'object',
          properties: {
            resumen: { type: 'string', description: '2-4 frases' },
            fugas: {
              type: 'array',
              items: {
                type: 'object',
                properties: { titulo: { type: 'string' }, detalle: { type: 'string' }, urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] } },
                required: ['titulo', 'detalle', 'urgencia'],
              },
            },
            plan_accion: {
              type: 'array',
              items: { type: 'object', properties: { titulo: { type: 'string' }, detalle: { type: 'string' } }, required: ['titulo', 'detalle'] },
            },
            conclusion: { type: 'string', description: '1-2 frases' },
          },
          required: ['resumen', 'fugas', 'plan_accion', 'conclusion'],
        },
      }, 1800)
      setAnalisis(analisisObj)
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  const chartData = metrics.map((m) => ({ week: fmtF(m.week_start), valor: m[grafica] === null || m[grafica] === undefined ? null : Number(m[grafica]) }))
  const URGENCIA_COLOR = { alta: 'var(--danger)', media: 'var(--gold)', baja: 'var(--text-muted)' }
  const filas = metrics.map((m, i) => ({ ...m, _prev: metrics[i - 1] })).reverse()

  function campoEntrada(m) {
    return (
      <div key={m.key}>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }} title={m.indica}>{m.label}{m.unit === '$' ? ' ($)' : ''}</label>
        <Input type="number" step="any" value={form[m.key]} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })} />
      </div>
    )
  }
  function campoCalculado(m) {
    return (
      <div key={m.key}>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }} title={m.indica}>{m.label}</label>
        <div className="px-3 py-2 rounded-md text-sm tabular-nums" style={{ background: 'var(--panel-alt)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
          {fmtMetrica(m, calculadas[m.key])}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Métricas semanales"
        subtitle="Las mismas métricas de tu Excel de seguimiento, modelo por modelo, con análisis automático."
        action={canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => { setPanel(panel === 'archivo' ? null : 'archivo'); setShowForm(false); setArchErr(''); setArchMsg('') }}>{panel === 'archivo' ? 'Cancelar' : '📥 Subir Excel'}</Button>
            <Button variant="ghost" onClick={() => { setPanel(panel === 'excel' ? null : 'excel'); setShowForm(false) }}>{panel === 'excel' ? 'Cancelar' : 'Pegar del Excel'}</Button>
            <Button variant="ghost" onClick={() => { setPanel(panel === 'ia' ? null : 'ia'); setShowForm(false) }}>{panel === 'ia' ? 'Cancelar' : '✨ Importar con IA'}</Button>
            <Button onClick={() => (showForm ? cerrarForm() : abrirNueva())}>{showForm ? 'Cancelar' : 'Añadir semana'}</Button>
          </div>
        )}
      />

      {panel === 'archivo' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">Subir el Excel de seguimiento de {nombreModelo}</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Sube el archivo .xlsx de esta modelo tal cual lo usas. El CRM lee todas las semanas (OnlyFans e Instagram), calcula los ratios con tus fórmulas y te enseña un resumen antes de cargar. Las celdas vacías no borran lo que ya haya guardado. Puedes volver a subir el archivo cada semana sin duplicar nada.
          </p>
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={elegirArchivo} className="text-sm mb-3 block" disabled={archBusy} />
          {archBusy && !arch && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Leyendo el archivo…</p>}
          {archErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{archErr}</p>}
          {archMsg && <p className="text-sm mb-3" style={{ color: 'var(--success)' }}>{archMsg}</p>}
          {arch && (() => {
            const ex = new Set(metrics.map((m) => m.week_start))
            const orden = [...arch.semanas].sort((a, b) => a.week_start.localeCompare(b.week_start))
            const nuevas = orden.filter((x) => !ex.has(x.week_start)).length
            return (
              <div>
                <div className="p-3 rounded-md mb-3" style={{ background: 'var(--panel-alt)' }}>
                  <p className="text-sm font-medium">Se cargará en: {nombreModelo}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {arch.nombre} · hoja «{arch.hoja}» · {orden.length} semanas ({fmtF(orden[0].week_start)} → {fmtF(orden[orden.length - 1].week_start)}) · {nuevas} nuevas, {orden.length - nuevas} ya existen. ¿No es la modelo correcta? Cámbiala arriba en el selector antes de cargar.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 mb-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" checked={arch.modo === 'actualizar'} onChange={() => setArch({ ...arch, modo: 'actualizar' })} /> Cargar todo y actualizar lo que ya existe</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={arch.modo === 'nuevas'} onChange={() => setArch({ ...arch, modo: 'nuevas' })} /> Solo añadir semanas nuevas (no tocar lo existente)</label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={importarArchivo} disabled={archBusy}>{archBusy ? 'Cargando…' : 'Cargar en el CRM'}</Button>
                  <Button variant="ghost" onClick={() => setArch(null)} disabled={archBusy}>Descartar</Button>
                </div>
              </div>
            )
          })()}
        </Panel>
      )}

      {panel === 'excel' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">Pegar una columna de tu Excel</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            En tu Excel, selecciona la columna de una semana, desde «Fac. cuenta» hasta «Días suscritos» (o hasta «Ratio de Vistas» si quieres también Instagram), cópiala y pégala aquí. Si incluyes también la celda de la fecha, la semana se pone sola. Después podrás revisar todo antes de guardar.
          </p>
          <textarea
            value={excelText} onChange={(e) => setExcelText(e.target.value)} rows={8}
            placeholder="Pega aquí la columna copiada del Excel..."
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3 font-mono"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          {excelMsg && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{excelMsg}</p>}
          <Button onClick={aplicarExcel} disabled={!excelText.trim()}>Cargar en el formulario</Button>
        </Panel>
      )}

      {panel === 'ia' && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">✨ Importar métricas con IA</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Pega una captura de pantalla (Ctrl+V) de Infloww u OFM PRO, o escribe o pega el texto con los números de la semana. La IA rellena el formulario para que lo revises antes de guardar. Nunca se guarda sola.
          </p>
          <textarea
            value={importText} onChange={(e) => setImportText(e.target.value)} onPaste={handlePasteImagen} rows={5}
            placeholder="Pega aquí una captura (Ctrl+V) o escribe o pega el texto con los datos..."
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          {importImage && (
            <div className="mb-3 flex items-center gap-3">
              <img src={`data:${importImage.mediaType};base64,${importImage.base64}`} alt="Captura pegada" className="h-24 rounded-md border" style={{ borderColor: 'var(--border)' }} />
              <button onClick={() => setImportImage(null)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Quitar imagen</button>
            </div>
          )}
          {importErr && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{importErr}</p>}
          <Button onClick={extraerConIA} disabled={importBusy}>{importBusy ? 'Extrayendo…' : 'Extraer datos'}</Button>
        </Panel>
      )}

      <div className="mb-6 max-w-xs">
        <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
        </Select>
      </div>

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={handleSave}>
            <p className="text-sm font-medium mb-3">{editId ? 'Editar semana' : 'Añadir semana'} · {models.find((m) => m.id === selectedModel)?.stage_name}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-1">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Semana (cualquier día, se ajusta al lunes)</label>
                <Input type="date" value={form.week_start} onChange={(e) => setForm({ ...form, week_start: e.target.value, fecha_informe: '' })} required />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>o fecha del informe, como en el Excel</label>
                <Input type="date" value={form.fecha_informe} onChange={(e) => setForm({ ...form, fecha_informe: e.target.value, week_start: e.target.value ? semanaDeInforme(e.target.value) : form.week_start })} />
              </div>
              <div className="self-end pb-2 text-sm" style={{ color: 'var(--accent)' }}>
                {semana ? `Semana del ${fmtF(semana)} al ${fmtF(finSemana(semana))}` : ''}
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              La fecha de cada columna de tu Excel es el lunes siguiente: el informe describe la semana anterior. Si usas la fecha del informe, la semana se calcula sola.
            </p>

            <p className="text-xs font-medium mb-2" style={{ color: 'var(--gold)' }}>MÉTRICAS ONLYFANS</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {OF.map((m) => (m.calc ? campoCalculado(m) : campoEntrada(m)))}
            </div>

            <p className="text-xs font-medium mb-2" style={{ color: 'var(--gold)' }}>MÉTRICAS INSTAGRAM</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {IG.map((m) => (m.calc ? campoCalculado(m) : campoEntrada(m)))}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Las casillas con borde discontinuo se calculan solas con las mismas fórmulas del Excel. Si una semana no tienes un dato, déjalo vacío: no se cuenta como cero.</p>

            <details className="mb-4">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}>Otros datos opcionales (ingresos netos, PPV, tips, alcance...)</summary>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {EXTRAS.map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
                    <Input type="number" step="any" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
            </details>

            <textarea
              value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2}
              placeholder="Notas de contexto de esta semana (restricción, cambio a gratis, campaña puntual...)"
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar semana'}</Button>
              <Button type="button" variant="ghost" onClick={cerrarForm}>Cancelar</Button>
            </div>
          </form>
        </Panel>
      )}

      {metrics.length > 0 && (
        <Panel className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <Select value={grafica} onChange={(e) => setGrafica(e.target.value)} className="max-w-[220px]">
              {GRAFICAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Button onClick={generarAnalisis} disabled={iaBusy}>{iaBusy ? 'Analizando…' : '✨ Generar análisis de esta semana'}</Button>
          </div>
          {chartData.length > 1 && (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} minTickGap={24} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="valor" name={GRAFICAS.find((g) => g[0] === grafica)?.[1]} stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
          {iaErr && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{iaErr}</p>}
        </Panel>
      )}

      {analisis && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">📋 Resumen</p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>{analisis.resumen}</p>
          {analisis.fugas?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">⚠️ Fugas detectadas</p>
              <div className="space-y-2 mb-5">
                {analisis.fugas.map((f, i) => (
                  <div key={i} className="p-3 rounded-md" style={{ background: 'var(--panel-alt)', borderLeft: `3px solid ${URGENCIA_COLOR[f.urgencia] || 'var(--text-muted)'}` }}>
                    <p className="text-sm font-medium" style={{ color: URGENCIA_COLOR[f.urgencia] }}>{f.titulo}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{f.detalle}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {analisis.plan_accion?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">🎯 Plan de acción</p>
              <div className="space-y-2 mb-5">
                {analisis.plan_accion.map((a, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                    <span className="font-display font-semibold gold-text">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{a.detalle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="text-sm font-medium mb-2">✅ Conclusión</p>
          <p className="text-sm">{analisis.conclusion}</p>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : metrics.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Esta modelo aún no tiene semanas registradas.</p>
        ) : (
          <div className="overflow-x-auto" style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table className="text-sm" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)', position: 'sticky', left: 0, top: 0, background: 'var(--panel)', zIndex: 2 }}>Semana</th>
                  {TODAS.map((m) => (
                    <th key={m.key} title={m.indica} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--panel)', borderLeft: m.key === 'ig_followers_total' ? '1px solid var(--border)' : undefined }}>{m.label}</th>
                  ))}
                  {canEdit && <th className="px-3 py-2" style={{ position: 'sticky', top: 0, background: 'var(--panel)' }} />}
                </tr>
              </thead>
              <tbody>
                {filas.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ position: 'sticky', left: 0, background: 'var(--panel)' }} title={m.notas || ''}>
                      {fmtF(m.week_start)}{m.notas ? ' •' : ''}
                    </td>
                    {TODAS.map((c) => (
                      <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ borderLeft: c.key === 'ig_followers_total' ? '1px solid var(--border)' : undefined }}>
                        <div className="flex items-center gap-2">
                          <span>{fmtMetrica(c, m[c.key])}</span>
                          {['billing_total', 'of_subs_new', 'of_profile_visits', 'active_fans'].includes(c.key) && <DeltaBadge actual={m[c.key]} anterior={m._prev?.[c.key]} />}
                        </div>
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => abrirEditar(m)} className="text-xs hover:underline mr-3" style={{ color: 'var(--accent)' }}>Editar</button>
                        <button onClick={() => borrar(m)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-6">
        <button onClick={() => setVerGuia(!verGuia)} className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
          {verGuia ? 'Ocultar' : 'Ver'} qué indica cada métrica y posibles fallos
        </button>
        {verGuia && (
          <Panel className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Métrica', 'Qué nos indica', 'Posibles fallos'].map((c) => <th key={c} className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {TODAS.filter((m) => m.fallo || m.indica).map((m) => (
                  <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2 whitespace-nowrap"><strong>{m.label}</strong></td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{m.indica}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{m.fallo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </div>
  )
}
