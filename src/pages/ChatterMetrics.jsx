import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, Table, Td, PageHeader } from '../components/ui'
import { iaCall, iaJson, getVoiceGuide, withVoiceGuide } from '../lib/ai'

const EMPTY_FORM = { model_id: '', week_start: '', sales: '', messages_sent: '', ppv_unlocked: '', notes: '' }

const REGLAS_CHATTER = `Eres el analista de rendimiento del equipo de chat de la agencia Divine Desire. Analizas la evolución semanal de un chatter concreto (puede llevar varias modelos a la vez). Ten en cuenta:
1. Compara la tendencia (¿sube, baja o se mantiene?), no solo el número absoluto de la última semana.
2. Un chatter con ventas altas pero muy pocos mensajes puede indicar suerte puntual, no una técnica repetible — coméntalo si lo ves.
3. Una caída de más del 25% respecto a la media de las semanas anteriores merece atención, no solo un dato más.
4. Si un chatter lleva varias modelos, valora si el rendimiento es consistente entre todas o se concentra en una sola.
5. Sé directo, breve y accionable — nada de relleno.`

function fmtEs(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }) }

export default function ChatterMetrics() {
  const [chatters, setChatters] = useState([])
  const [models, setModels] = useState([])
  const [selectedChatter, setSelectedChatter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)

  const [analisis, setAnalisis] = useState(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErr, setIaErr] = useState('')

  async function loadListas() {
    const [cs, { data: m }] = await Promise.all([
      getProfilesByRoles(['chatter', 'manager']),
      supabase.from('models').select('id, stage_name').order('stage_name'),
    ])
    setChatters(cs)
    setModels(m || [])
    if (cs.length && !selectedChatter) setSelectedChatter(cs[0].id)
    if (m?.length) setForm((f) => ({ ...f, model_id: f.model_id || m[0].id }))
  }

  async function loadRows(chatterId) {
    if (!chatterId) return
    setLoading(true)
    const { data } = await supabase
      .from('chatter_performance')
      .select('*, models(stage_name)')
      .eq('chatter_id', chatterId)
      .order('week_start', { ascending: true })
    setRows(data || [])
    setLoading(false)
    setAnalisis(null)
  }

  useEffect(() => { loadListas() }, [])
  useEffect(() => { loadRows(selectedChatter) }, [selectedChatter])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('chatter_performance').insert([{
      chatter_id: selectedChatter,
      model_id: form.model_id,
      week_start: form.week_start,
      sales: form.sales ? parseFloat(form.sales) : 0,
      messages_sent: form.messages_sent ? parseInt(form.messages_sent) : null,
      ppv_unlocked: form.ppv_unlocked ? parseInt(form.ppv_unlocked) : null,
      notes: form.notes || null,
    }])
    if (error) { setError('No se pudo guardar. ¿Ya existe una entrada para esa modelo y esa semana?'); return }
    setForm({ ...EMPTY_FORM, model_id: form.model_id })
    setShowForm(false)
    loadRows(selectedChatter)
  }

  async function generarAnalisis() {
    setIaBusy(true); setIaErr(''); setAnalisis(null)
    try {
      const nombre = chatters.find((c) => c.id === selectedChatter)?.full_name || ''
      const guia = await getVoiceGuide()
      const system = withVoiceGuide(REGLAS_CHATTER + `\n\nDevuelve SOLO un JSON válido (sin markdown): {"resumen":"2-4 frases","puntos_atencion":[{"titulo":"...","detalle":"...","urgencia":"alta|media|baja"}],"plan_accion":[{"titulo":"...","detalle":"..."}],"conclusion":"1-2 frases"}. Si no hay puntos de atención, devuelve un array vacío.`, guia)
      const txt = await iaCall(system, [{ role: 'user', content: `Chatter: ${nombre}\n\nHistórico semanal (por modelo):\n${JSON.stringify(rows.map((r) => ({ semana: r.week_start, modelo: r.models?.stage_name, ventas: r.sales, mensajes: r.messages_sent, ppv_desbloqueados: r.ppv_unlocked, notas: r.notes })), null, 0)}` }], 1500)
      setAnalisis(iaJson(txt))
    } catch (e) { setIaErr(e.message) }
    setIaBusy(false)
  }

  const porSemana = {}
  rows.forEach((r) => { porSemana[r.week_start] = (porSemana[r.week_start] || 0) + (Number(r.sales) || 0) })
  const chartData = Object.entries(porSemana).sort(([a], [b]) => a.localeCompare(b)).map(([week, ventas]) => ({ week, Ventas: ventas }))

  const URGENCIA_COLOR = { alta: 'var(--danger)', media: 'var(--gold)', baja: 'var(--text-muted)' }

  return (
    <div>
      <PageHeader
        title="Métricas de chatters"
        subtitle="Rendimiento semanal de cada chatter, modelo por modelo — con análisis automático."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : 'Añadir semana'}</Button>}
      />

      <div className="mb-6 max-w-xs">
        <Select value={selectedChatter} onChange={(e) => setSelectedChatter(e.target.value)}>
          {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </Select>
      </div>

      {showForm && (
        <Panel className="p-5 mb-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.stage_name}</option>)}
            </Select>
            <Input type="date" value={form.week_start} onChange={(e) => setForm({ ...form, week_start: e.target.value })} required />
            <Input type="number" step="0.01" placeholder="Ventas ($)" value={form.sales} onChange={(e) => setForm({ ...form, sales: e.target.value })} />
            <Input type="number" placeholder="Mensajes enviados" value={form.messages_sent} onChange={(e) => setForm({ ...form, messages_sent: e.target.value })} />
            <Input type="number" placeholder="PPV desbloqueados" value={form.ppv_unlocked} onChange={(e) => setForm({ ...form, ppv_unlocked: e.target.value })} />
            <Input placeholder="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {error && <p className="col-span-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="col-span-3">Guardar semana</Button>
          </form>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Ventas totales por semana ($, todas las modelos)</p>
            <Button onClick={generarAnalisis} disabled={iaBusy}>{iaBusy ? 'Analizando…' : '✨ Generar análisis'}</Button>
          </div>
          {chartData.length > 1 && (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="Ventas" stroke="var(--accent)" strokeWidth={2} dot={false} />
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

          {analisis.puntos_atencion?.length > 0 && (
            <>
              <p className="text-sm font-medium mb-2">⚠️ Puntos de atención</p>
              <div className="space-y-2 mb-5">
                {analisis.puntos_atencion.map((f, i) => (
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
            columns={['Semana', 'Modelo', 'Ventas', 'Mensajes', 'PPV desbloqueados', 'Notas']}
            rows={[...rows].reverse()}
            renderRow={(r) => (
              <>
                <Td>{r.week_start}</Td>
                <Td>{r.models?.stage_name}</Td>
                <Td>${fmtEs(r.sales)}</Td>
                <Td>{fmtEs(r.messages_sent)}</Td>
                <Td>{fmtEs(r.ppv_unlocked)}</Td>
                <Td style={{ color: 'var(--text-muted)' }}>{r.notes || '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
