import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, PageHeader } from '../components/ui'

function Kpi({ label, value }) {
  return (
    <Panel className="p-5">
      <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-display font-semibold">{value}</p>
    </Panel>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ count: modelsCount }, { count: accountsCount }, { count: leadsCount }, { data: lastWeek }] = await Promise.all([
        supabase.from('models').select('*', { count: 'exact', head: true }).eq('status', 'activa'),
        supabase.from('instagram_accounts').select('*', { count: 'exact', head: true }),
        supabase.from('recruitment_leads').select('*', { count: 'exact', head: true }).not('stage', 'in', '(firmado,descartado)'),
        supabase.from('weekly_metrics').select('of_net_sales').order('week_start', { ascending: false }).limit(20),
      ])
      const totalLastPeriod = (lastWeek || []).reduce((sum, r) => sum + (Number(r.of_net_sales) || 0), 0)
      setStats({ modelsCount, accountsCount, leadsCount, totalLastPeriod })
    }
    load()
  }, [])

  return (
    <div>
      <PageHeader
        title={`Hola, ${profile?.full_name?.split(' ')[0] || ''}`}
        subtitle="Resumen general de la agencia."
      />
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Modelos activas" value={stats?.modelsCount ?? '—'} />
        <Kpi label="Cuentas de Instagram" value={stats?.accountsCount ?? '—'} />
        <Kpi label="Leads en proceso" value={stats?.leadsCount ?? '—'} />
        <Kpi label="Ventas OF (últimas semanas)" value={stats ? `${stats.totalLastPeriod.toFixed(0)} €` : '—'} />
      </div>
    </div>
  )
}
