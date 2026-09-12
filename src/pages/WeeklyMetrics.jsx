import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Input, Select, Table, Td, PageHeader } from '../components/ui'

export default function WeeklyMetrics() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ week_start: '', of_net_sales: '', of_subs_new: '', ig_reach: '', ig_new_followers: '' })
  const [error, setError] = useState(null)

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
  }

  useEffect(() => { loadModels() }, [])
  useEffect(() => { loadMetrics(selectedModel) }, [selectedModel])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('weekly_metrics').insert([{
      model_id: selectedModel,
      week_start: form.week_start,
      of_net_sales: form.of_net_sales || null,
      of_subs_new: form.of_subs_new || null,
      ig_reach: form.ig_reach || null,
      ig_new_followers: form.ig_new_followers || null,
    }])
    if (error) {
      setError('No se pudo guardar. ¿Ya existe una entrada para esa semana y ese modelo?')
      return
    }
    setForm({ week_start: '', of_net_sales: '', of_subs_new: '', ig_reach: '', ig_new_followers: '' })
    setShowForm(false)
    loadMetrics(selectedModel)
  }

  const chartData = metrics.map((m) => ({
    week: m.week_start,
    Ventas: Number(m.of_net_sales) || 0,
    Alcance_IG: Number(m.ig_reach) || 0,
  }))

  return (
    <div>
      <PageHeader
        title="Métricas semanales"
        subtitle="Evolución de OnlyFans e Instagram, modelo por modelo."
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
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              required
            />
            <Input
              type="number" step="0.01"
              placeholder="Ventas netas OF (€)"
              value={form.of_net_sales}
              onChange={(e) => setForm({ ...form, of_net_sales: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Nuevos subs OF"
              value={form.of_subs_new}
              onChange={(e) => setForm({ ...form, of_subs_new: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Alcance Instagram"
              value={form.ig_reach}
              onChange={(e) => setForm({ ...form, ig_reach: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Nuevos seguidores IG"
              value={form.ig_new_followers}
              onChange={(e) => setForm({ ...form, ig_new_followers: e.target.value })}
            />
            {error && <p className="col-span-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" className="col-span-2">Guardar semana</Button>
          </form>
        </Panel>
      )}

      {chartData.length > 1 && (
        <Panel className="p-5 mb-6">
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Ventas netas OF por semana (€)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="Ventas" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Semana', 'Ventas OF (€)', 'Nuevos subs', 'Alcance IG', 'Nuevos seg. IG']}
            rows={metrics}
            renderRow={(m) => (
              <>
                <Td>{m.week_start}</Td>
                <Td>{m.of_net_sales ?? '—'}</Td>
                <Td>{m.of_subs_new ?? '—'}</Td>
                <Td>{m.ig_reach ?? '—'}</Td>
                <Td>{m.ig_new_followers ?? '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
