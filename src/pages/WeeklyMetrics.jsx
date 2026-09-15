import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, PageHeader } from '../components/ui'
import { iaCall, iaJson, getVoiceGuide, withVoiceGuide } from '../lib/ai'

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
7. Sé directo y concreto, sin relleno. Estructura pensada para que se lea en 30 segundos y se entienda en detalle si hace falta profundizar.`

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

  async function generarAnalisis() {
    setIaBusy(true); setIaErr(''); setAnalisis(null)
    try {
      const modeloNombre = models.find((m) => m.id === selectedModel)?.stage_name || ''
      const ultimas = metrics.slice(-10)
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(REGLAS_ANALISIS + `\n\nDevuelve SOLO un JSON válido (sin markdown) con esta forma exacta: {"resumen":"2-4 frases","fugas":[{"titulo":"...","detalle":"...","urgencia":"alta|media|baja"}],"plan_accion":[{"titulo":"...","detalle":"..."}],"conclusion":"1-2 frases"}. Si no hay fugas relevantes esta semana, devuelve fugas como array vacío.`, guia)
      const txt = await iaCall(system, [{ role: 'user', content: `Modelo: ${modeloNombre}\n\nHistórico de las últimas semanas (la última fila es la semana a analizar):\n${JSON.stringify(ultimas, null, 0)}` }], 1800)
      setAnalisis(iaJson(txt))
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
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : 'Añadir semana'}
          </Button>
        )}
      />

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
                <div className="grid grid-cols-4 gap-3">
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
            rows={[...metrics].reverse()}
            renderRow={(m) => (
              <>
                <Td>{m.week_start}</Td>
                <Td>{fmtEs(m.billing_total ?? m.of_net_sales)}</Td>
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
