import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, PageHeader } from '../components/ui'

function Kpi({ label, value }) {
  return (
    <Panel className="p-5">
      <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-display font-semibold gold-text">{value}</p>
    </Panel>
  )
}

export default function Dashboard() {
  const { profile, role } = useAuth()
  const [stats, setStats] = useState(null)
  const [sanciones, setSanciones] = useState(null)
  const esChatTeam = ['admin', 'manager', 'chatter'].includes(role)

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

  useEffect(() => {
    async function loadSanciones() {
      if (!esChatTeam) return
      const { data } = await supabase.from('sanctions').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(5)
      setSanciones(data || [])
    }
    loadSanciones()
  }, [esChatTeam])

  return (
    <div>
      <PageHeader
        title={`Hola, ${profile?.full_name?.split(' ')[0] || ''}`}
        subtitle="Resumen general de la agencia."
      />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Kpi label="Modelos activas" value={stats?.modelsCount ?? '—'} />
        <Kpi label="Cuentas de Instagram" value={stats?.accountsCount ?? '—'} />
        <Kpi label="Leads en proceso" value={stats?.leadsCount ?? '—'} />
        <Kpi label="Ventas OF (últimas semanas)" value={stats ? `${stats.totalLastPeriod.toFixed(0)} €` : '—'} />
      </div>

      {esChatTeam && (
        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">⚠️ Sanciones recientes del equipo</p>
          {sanciones === null ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          ) : sanciones.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin sanciones registradas.</p>
          ) : (
            <div className="space-y-2">
              {sanciones.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <strong className="w-28 truncate">{s.profiles?.full_name}</strong>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{s.motivo}</span>
                  {s.monto > 0 && <span style={{ color: 'var(--danger)' }}>${Number(s.monto).toFixed(2)}</span>}
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(s.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
