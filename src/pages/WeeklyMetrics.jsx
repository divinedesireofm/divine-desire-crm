import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, PageHeader, DeltaBadge } from '../components/ui'
import { iaCallJSON, getVoiceGuide, withVoiceGuide } from '../lib/ai'

const EMPTY_FORM = {
  week_start: '', billing_total: '', of_net_sales: '', subscription_income: '',
  of_subs_new: '', of_subs_churned: '', renewals_count: '', renewal_income: '', renewal_activated_count: '',
  conversion_pct: '', income_per_visit: '', active_fans: '', arppu: '', arpu: '', avg_days_subscribed: '',
  chat_ratio: '', of_ppv_sent: '', of_ppv_purchased: '', of_tips: '',
  ig_reach: '', ig_new_followers: '', ig_profile_visits: '', ig_link_clicks: '', notas: '',
}

const REGLAS_ANALISIS = `Eres el analista de métricas semanales de la agencia Divine Desire (gestión de creadoras de OnlyFans). Analizas los datos de Infloww (chat) y OFM PRO (Instagram) exactamente como lo haría un analista senior del sector. Sigue SIEMPRE estas reglas aprendidas, son innegociables:

1. LA REGLA DEL EMBUDO: si visitas, subs nuevas y facturación no se mueven en la misma dirección y orden de magnitud, sospecha primero de una métrica rota (ej. contador de visitas de OnlyFans, que se rompe con frecuencia) antes de sacar conclusiones de negocio. Una conversión visitas→subs superior al 3% suele ser imposible; si aparece, el denominador (visitas) está mal, no es una mejora real.
2. NUNCA recomiendes bajar precios de PPV — reduce ingresos sin mejorar la tasa de desbloqueo. Si algo hay que hacer con precios, es subirlos cuando el mercado lo aguante.
3. Los tips como % de la facturación son el termómetro de la conexión emocional con los fans. Objetivo sano: >8%. Por debajo de 3% es una señal de alarma de calidad de chat, no solo de volumen.
4. Si el ARPU (ingreso medio por fan) sube mientras la facturación total baja, es una señal de CONTRACCIÓN (la base de fans se está reduciendo), no de mejora — no lo confundas con una buena noticia.
5. El modelo de suscripción gratuita desmonta el pipeline de renovaciones con el tiempo — es una palanca de captación puntual, nunca una estrategia permanente. Si lleva varias semanas activa, avisa del riesgo.
6. Cuando falten datos de una semana o parezcan inconsistentes con las anteriores, dilo explícitamente en vez de inventar una explicación de negocio.
7. Sé directo y concreto, sin relleno. Estructura pensada para que se lea en 30 segundos y se entienda en detalle si hace falta profundizar.
8. "Fans activos" y "días suscritos" son una FOTO de un momento (stock): no los sumes entre semanas, compáralos semana a semana. "Subs nuevas", "renovaciones" y "facturación" sí son flujo y se pueden sumar en un periodo.`

const CAMPOS_IMPORTABLES = [
  'billing_total', 'of_net_sales', 'subscription_income', 'of_subs_new', 'of_subs_churned',
  'renewals_count', 'renewal_income', 'renewal_activated_count', 'conversion_pct', 'income_per_visit',
  'active_fans', 'arppu', 'arpu', 'avg_days_subscribed', 'chat_ratio', 'of_ppv_sent', 'of_ppv_purchased',
  'of_tips', 'ig_reach', 'ig_new_followers', 'ig_profile_visits', 'ig_link_clicks',
]

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) }

export default function WeeklyMetrics() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)

  const [analisis, setAnalisis] = useState(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErr, setIaErr] = useState('')

  const [showImportador, setShowImportador] = useState(false)
  const [importText, setImportText] = useState('')
  const [importImage, setImportImage] = useState(null) // { mediaType, base64 }
  const [importBusy, setImportBusy] = useState(false)
  const [importErr, setImportErr] = useState('')

  async function loadModels() {
    const { data } = await supabase.from('models').select('id, stage_name').order('stage_name')
    setModels(data || [])
    if (data?.length && !selectedModel) setSelectedModel(data[0].id)
  }

  async function loadMetrics(modelId) {
    if (!modelId) return
    setLoading(true)
    const { data } = await supabase
      .from('weekly_metrics')
      .select('*')
      .eq('model_id', modelId)
      .order('week_start', { ascending: true })
    setMetrics(data || [])
    setLoading(false)
    setAnalisis(null)
  }

  useEffect(() => { loadModels() }, [])
  useEffect(() => { loadMetrics(selectedModel) }, [selectedModel])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const payload = { model_id: selectedModel, week_start: form.week_start }
    Object.keys(EMPTY_FORM).forEach((k) => {
      if (k === 'week_start') return
      if (k === 'notas') { payload[k] = form[k] || null; return }
      payload[k] = form[k] === '' ? null : parseFloat(form[k])
    })
    const { error } = await supabase.from('weekly_metrics').insert([payload])
    if (error) {
      setError('No se pudo guardar. ¿Ya existe una entrada para esa semana y ese modelo?')
      return
    }
    setForm(EMPTY_FORM)
    setShowForm(false)
    loadMetrics(selectedModel)
  }

  function handlePasteImagen(e) {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      setImportImage({ mediaType: file.type, base64 })
    }
    reader.readAsDataURL(file)
  }

  async function extraerConIA() {
    if (!importText.trim() && !importImage) { setImportErr('Pega el texto o la captura con los datos de la semana.'); return }
    setImportBusy(true); setImportErr('')
    try {
      const contenido = []
      if (importImage) contenido.push({ type: 'image', source: { type: 'base64', media_type: importImage.mediaType, data: importImage.base64 } })
      contenido.push({ type: 'text', text: importText.trim() || 'Extrae los datos de la captura.' })

      const system = `Eres experto en leer informes de Infloww (chat de OnlyFans) y OFM PRO (Instagram) de agencias de creadoras. Te van a pasar una captura de pantalla y/o un texto con las métricas de UNA semana. Extrae los valores EXACTOS que veas — nunca inventes ni redondees de más. Si un dato no aparece en absoluto, devuélvelo como null, no como 0. Si ves una fecha de la semana, conviértela a formato YYYY-MM-DD (lunes de esa semana); si no la ves, devuelve week_start como null.`

      const schema = {
        type: 'object',
        properties: {
          week_start: { type: ['string', 'null'], description: 'YYYY-MM-DD, lunes de la semana, o null si no aparece' },
          ...Object.fromEntries(CAMPOS_IMPORTABLES.map((c) => [c, { type: ['number', 'null'] }])),
        },
        required: ['week_start', ...CAMPOS_IMPORTABLES],
      }

      const extraido = await iaCallJSON(system, [{ role: 'user', content: contenido }], {
        tool_name: 'entregar_metricas', tool_description: 'Entrega las métricas extraídas.', schema,
      }, 1200)

      const nuevoForm = { ...EMPTY_FORM }
      if (extraido.week_start) nuevoForm.week_start = extraido.week_start
      CAMPOS_IMPORTABLES.forEach((c) => { if (extraido[c] !== null && extraido[c] !== undefined) nuevoForm[c] = String(extraido[c]) })
      setForm(nuevoForm)
      setShowImportador(false)
      setShowForm(true)
      setImportText(''); setImportImage(null)
    } catch (e) { setImportErr(e.message) }
    setImportBusy(false)
  }

  async function generarAnalisis() {
    setIaBusy(true); setIaErr(''); setAnalisis(null)
    try {
      const modeloNombre = models.find((m) => m.id === selectedModel)?.stage_name || ''
      const ultimas = metrics.slice(-10)
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(REGLAS_ANALISIS + `\n\nAntes de afirmar que algo es un problema, pregúntate si hay otra explicación posible (un dato roto, una semana atípica, una campaña puntual). Si hay más de una explicación razonable, dilo como pregunta abierta en vez de darla por hecho.`, guia)
      const analisisObj = await iaCallJSON(system, [{ role: 'user', content: `Modelo: ${modeloNombre}\n\nHistórico de las últimas semanas (la última fila es la semana a analizar):\n${JSON.stringify(ultimas, null, 0)}` }], {
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
                properties: {
                  titulo: { type: 'string' }, detalle: { type: 'string' },
                  urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] },
                },
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

  const chartData = metrics.map((m) => ({
    week: m.week_start,
    Facturación: Number(m.billing_total ?? m.of_net_sales) || 0,
    Alcance_IG: Number(m.ig_reach) || 0,
  }))

  const URGENCIA_COLOR = { alta: 'var(--danger)', media: 'var(--gold)', baja: 'var(--text-muted)' }

  const CAMPOS = [
    { titulo: 'Facturación y suscripciones', campos: [
      ['billing_total', 'Facturación total ($)'],
      ['of_net_sales', 'Ingresos netos ($, tras comisión OF)'],
      ['subscription_income', 'Ingresos por suscripción ($)'],
      ['of_subs_new', 'Subs nuevas'],
      ['of_subs_churned', 'Bajas'],
    ]},
    { titulo: 'Renovaciones', campos: [
      ['renewals_count', 'Renovaciones (nº)'],
      ['renewal_income', 'Ingresos renovación ($)'],
      ['renewal_activated_count', 'Renovación activada (nº)'],
    ]},
    { titulo: 'Fans y actividad de chat', campos: [
      ['active_fans', 'Fans activos'],
      ['arppu', '$ x Spender (ARPPU)'],
      ['arpu', '$ x Fan (ARPU)'],
      ['avg_days_subscribed', 'Días suscritos (media)'],
      ['chat_ratio', 'Ratio de chatting'],
      ['of_ppv_sent', 'PPV enviados'],
      ['of_ppv_purchased', 'PPV comprados'],
      ['of_tips', 'Tips ($)'],
      ['conversion_pct', 'Conversión visitas→subs (%)'],
      ['income_per_visit', '$ / visita'],
    ]},
    { titulo: 'Instagram', campos: [
      ['ig_reach', 'Alcance'],
      ['ig_profile_visits', 'Visitas al perfil'],
      ['ig_new_followers', 'Nuevos seguidores'],
      ['ig_link_clicks', 'Clics al link'],
    ]},
  ]

  return (
    <div>
      <PageHeader
        title="Métricas semanales"
        subtitle="Evolución de OnlyFans e Instagram, modelo por modelo — con análisis automático."
        action={canEdit && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setShowImportador(!showImportador); setShowForm(false) }}>
              {showImportador ? 'Cancelar' : '✨ Importar con IA'}
            </Button>
            <Button onClick={() => { setShowForm(!showForm); setShowImportador(false) }}>
              {showForm ? 'Cancelar' : 'Añadir semana'}
            </Button>
          </div>
        )}
      />

      {showImportador && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-2">✨ Importar métricas con IA</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Pega aquí una captura de pantalla (Ctrl+V) de Infloww u OFM PRO, o simplemente escribe/pega el texto con los números de la semana.
            La IA rellenará el formulario para que lo revises antes de guardar — nunca se guarda solo.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            onPaste={handlePasteImagen}
            placeholder="Pega aquí una captura (Ctrl+V) o escribe/pega el texto con los datos..."
            rows={5}
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
          <form onSubmit={handleCreate}>
            <Input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              required
              className="mb-4 max-w-xs"
            />
            {CAMPOS.map((grupo) => (
              <div key={grupo.titulo} className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--gold)' }}>{grupo.titulo}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {grupo.campos.map(([key, label]) => (
                    <Input
                      key={key} type="number" step="0.01" placeholder={label}
                      value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  ))}
                </div>
              </div>
            ))}
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas de contexto de esta semana (restricción, cambio de modelo a gratis, campaña puntual...)"
              rows={2}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit">Guardar semana</Button>
          </form>
        </Panel>
      )}

      {metrics.length > 0 && (
        <Panel className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Facturación por semana ($)</p>
            <Button onClick={generarAnalisis} disabled={iaBusy}>{iaBusy ? 'Analizando…' : '✨ Generar análisis de esta semana'}</Button>
          </div>
          {chartData.length > 1 && (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="Facturación" stroke="var(--accent)" strokeWidth={2} dot={false} />
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
        ) : (
          <Table
            columns={['Semana', 'Facturación', 'Subs nuevas', 'Renovaciones', 'Tips', 'Alcance IG']}
            rows={metrics.map((m, i) => ({ ...m, _anterior: metrics[i - 1] })).reverse()}
            renderRow={(m) => (
              <>
                <Td>{m.week_start}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span>{fmtEs(m.billing_total ?? m.of_net_sales)}</span>
                    <DeltaBadge actual={m.billing_total ?? m.of_net_sales} anterior={m._anterior?.billing_total ?? m._anterior?.of_net_sales} />
                  </div>
                </Td>
                <Td>{fmtEs(m.of_subs_new)}</Td>
                <Td>{fmtEs(m.renewals_count)}</Td>
                <Td>{fmtEs(m.of_tips)}</Td>
                <Td>{fmtEs(m.ig_reach)}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
