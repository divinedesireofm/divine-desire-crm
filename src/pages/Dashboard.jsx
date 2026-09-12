import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, PageHeader } from '../components/ui'

function Kpi({ label, value, sub }) {
  return (
    <Panel className="p-5">
      <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-display font-semibold gold-text">{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </Panel>
  )
}

function fechaHoyISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

const TIPOS_ESTADO = { entrada: 'trabajando', fin_break: 'trabajando', break: 'en break', salida: 'fuera' }

export default function Dashboard() {
  const { profile, hasAnyRole } = useAuth()
  const [stats, setStats] = useState(null)
  const [sanciones, setSanciones] = useState(null)
  const [enTurno, setEnTurno] = useState(null)
  const [chatStats, setChatStats] = useState(null)
  const esChatTeam = hasAnyRole(['admin', 'manager', 'chatter'])

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
    async function loadChatWidgets() {
      if (!esChatTeam) return
      const hoy = fechaHoyISO()

      const [{ data: sancionesData }, { data: eventos }, { data: repDetails }, { count: reportesHoy }, { data: pillActiva }, equipo] = await Promise.all([
        supabase.from('sanctions').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('attendance_events').select('chatter_id, tipo, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(200),
        supabase.from('shift_report_details').select('facturacion, shift_reports!inner(fecha)').eq('shift_reports.fecha', hoy),
        supabase.from('shift_reports').select('*', { count: 'exact', head: true }).eq('fecha', hoy),
        supabase.from('training_pills').select('id, numero').eq('activa', true).eq('fecha_publicacion', hoy).limit(1),
        getProfilesByRoles(['admin', 'manager', 'chatter'], { onlyActive: true }),
      ])
      setSanciones(sancionesData || [])

      // último evento por chatter → quién está trabajando / en break ahora mismo
      const ultimos = {}
      ;(eventos || []).forEach((e) => { if (!ultimos[e.chatter_id]) ultimos[e.chatter_id] = e })
      const activos = Object.values(ultimos).filter((e) => e.tipo !== 'salida')
      setEnTurno(activos)

      const facturacionHoy = (repDetails || []).reduce((s, r) => s + (Number(r.facturacion) || 0), 0)

      let formacion = null
      if (pillActiva?.[0]) {
        const { count: respondieron } = await supabase.from('training_answers').select('*', { count: 'exact', head: true }).eq('pildora_id', pillActiva[0].id)
        formacion = { respondieron: respondieron || 0, total: equipo.length, numero: pillActiva[0].numero }
      }

      setChatStats({ facturacionHoy, reportesHoy: reportesHoy || 0, formacion })
    }
    loadChatWidgets()
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
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Kpi
              label="Facturado hoy (reportes)"
              value={chatStats ? `$${chatStats.facturacionHoy.toFixed(2)}` : '—'}
              sub={chatStats ? `${chatStats.reportesHoy} reporte${chatStats.reportesHoy !== 1 ? 's' : ''} enviado${chatStats.reportesHoy !== 1 ? 's' : ''} hoy` : ''}
            />
            <Kpi
              label="En turno ahora mismo"
              value={enTurno ? enTurno.filter((e) => e.tipo !== 'break').length : '—'}
              sub={enTurno ? `${enTurno.filter((e) => e.tipo === 'break').length} en break` : ''}
            />
            <Kpi
              label="Píldora de hoy"
              value={chatStats?.formacion ? `${chatStats.formacion.respondieron}/${chatStats.formacion.total}` : (chatStats ? 'Sin activar' : '—')}
              sub={chatStats?.formacion ? `#${chatStats.formacion.numero} · han respondido` : ''}
            />
          </div>

          {enTurno && enTurno.length > 0 && (
            <Panel className="p-5 mb-6">
              <p className="text-sm font-medium mb-3">👥 Quién está en turno ahora</p>
              <div className="flex flex-wrap gap-2">
                {enTurno.map((e) => (
                  <span
                    key={e.chatter_id}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: e.tipo === 'break' ? 'var(--gold)22' : 'var(--success)22',
                      color: e.tipo === 'break' ? 'var(--gold)' : 'var(--success)',
                    }}
                  >
                    {e.profiles?.full_name} · {TIPOS_ESTADO[e.tipo]}
                  </span>
                ))}
              </div>
            </Panel>
          )}

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
        </>
      )}
    </div>
  )
}
