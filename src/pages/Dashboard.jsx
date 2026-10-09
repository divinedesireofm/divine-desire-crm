import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, PageHeader } from '../components/ui'
import Icon from '../components/Icon'

const TURNOS = { madrugada: 'Madrugada', 'mañana': 'Mañana', tarde: 'Tarde' }
const TRAFICO = { bajo: { n: 'Bajo', c: 'var(--danger)' }, medio: { n: 'Medio', c: 'var(--gold)' }, alto: { n: 'Alto', c: 'var(--success)' } }
const TIPOS_ESTADO = { entrada: 'trabajando', fin_break: 'trabajando', break: 'en break', salida: 'fuera' }
const POR_PAGINA = 3
const MAX_REPORTES = 12
const HORAS_TURNO_MAX = 18 // un evento de entrada más antiguo que esto se considera un turno olvidado, no «en turno ahora»

const fmt$ = (n) => '$' + Number(n || 0).toFixed(2)
const fechaHoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const fmtFecha = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const fmtHora = (ts) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const inicial = (n) => (n || '?').trim().charAt(0).toUpperCase()

function Kpi({ label, value, sub, icon }) {
  return (
    <Panel className="p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--gold), transparent)' }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-3xl font-display font-semibold gold-text leading-none">{value}</p>
          {sub && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
        {icon && (
          <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
    </Panel>
  )
}

// Barra superior: cuántos chatters están dentro de su turno y quiénes
function BarraTurno({ enTurno }) {
  if (enTurno === null) return null
  const enBreak = enTurno.filter((e) => e.tipo === 'break').length
  return (
    <Panel className="p-4 mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="relative flex w-3 h-3">
            {enTurno.length > 0 && <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: 'var(--success)' }} />}
            <span className="relative inline-flex w-3 h-3 rounded-full" style={{ background: enTurno.length > 0 ? 'var(--success)' : 'var(--text-muted)' }} />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold leading-none">{enTurno.length}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{enTurno.length === 1 ? 'chatter en turno' : 'chatters en turno'}{enBreak > 0 ? ` · ${enBreak} en break` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {enTurno.length === 0 ? (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Nadie ha fichado su entrada ahora mismo.</span>
          ) : enTurno.map((e) => {
            const brk = e.tipo === 'break'
            const color = brk ? 'var(--gold)' : 'var(--success)'
            return (
              <span key={e.chatter_id} className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm" style={{ background: `${color}1f`, color }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: `${color}33` }}>{inicial(e.profiles?.full_name)}</span>
                {e.profiles?.full_name}
                <span className="text-xs opacity-75">{TIPOS_ESTADO[e.tipo]}</span>
              </span>
            )
          })}
        </div>
        <Link to="/asistencia" className="text-xs hover:underline shrink-0" style={{ color: 'var(--text-muted)' }}>Entradas y salidas →</Link>
      </div>
    </Panel>
  )
}

function TarjetaReporte({ r }) {
  const det = r.shift_report_details || []
  const ppv = det.reduce((a, d) => a + Number(d.facturacion || 0), 0)
  const tips = det.reduce((a, d) => a + Number(d.tips || 0), 0)
  const nombre = r.profiles?.full_name
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{inicial(nombre)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{nombre}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {fmtFecha(r.fecha)} · <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{TURNOS[r.turno] || r.turno}</span> · enviado {fmtHora(r.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-semibold gold-text leading-none">{fmt$(ppv + tips)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>PPV {fmt$(ppv)} · Tips {fmt$(tips)}</p>
        </div>
      </div>
      <div className="space-y-2">
        {det.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin detalle de modelos.</p>}
        {det.map((d, i) => {
          const t = TRAFICO[d.trafico]
          const total = Number(d.facturacion || 0) + Number(d.tips || 0)
          return (
            <div key={i} className="pl-3 py-1" style={{ borderLeft: `3px solid ${t?.c || 'var(--border)'}` }}>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <strong style={{ color: 'var(--accent)' }}>{d.models?.stage_name}</strong>
                {t && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${t.c}22`, color: t.c }}>Tráfico {t.n}</span>}
                <span className="text-xs tabular-nums ml-auto" style={{ color: total > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmt$(total)}</span>
              </div>
              {d.texto && <p className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{d.texto}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile, hasAnyRole } = useAuth()
  const [stats, setStats] = useState(null)
  const [sanciones, setSanciones] = useState(null)
  const [enTurno, setEnTurno] = useState(null)
  const [chatStats, setChatStats] = useState(null)
  const [reportes, setReportes] = useState(null)
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const esChatTeam = hasAnyRole(['admin', 'manager', 'chatter'])

  useEffect(() => {
    async function load() {
      const [{ count: modelsCount }, { count: accountsCount }, { count: leadsCount }, { data: lastWeek }] = await Promise.all([
        supabase.from('models').select('*', { count: 'exact', head: true }).eq('status', 'activa'),
        supabase.from('instagram_accounts').select('*', { count: 'exact', head: true }),
        supabase.from('recruitment_leads').select('*', { count: 'exact', head: true }).not('stage', 'in', '(firmado,descartado)'),
        supabase.from('weekly_metrics').select('week_start, billing_total').not('billing_total', 'is', null).order('week_start', { ascending: false }).limit(40),
      ])
      // Facturación de las cuentas en la semana más reciente con datos (suma de todas las modelos)
      const semana = (lastWeek || [])[0]?.week_start || null
      const totalSemana = (lastWeek || []).filter((r) => r.week_start === semana).reduce((s, r) => s + (Number(r.billing_total) || 0), 0)
      setStats({ modelsCount, accountsCount, leadsCount, totalSemana, semana })
    }
    load()
  }, [])

  useEffect(() => {
    async function loadChatWidgets() {
      if (!esChatTeam) return
      const hoy = fechaHoyISO()
      const desde = new Date(Date.now() - HORAS_TURNO_MAX * 3600000).toISOString()

      const [{ data: sancionesData }, { data: eventos }, { data: repDetails }, { count: reportesHoy }, { data: pillActiva }, equipo, { data: reps }] = await Promise.all([
        supabase.from('sanctions').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('attendance_events').select('chatter_id, tipo, created_at, profiles(full_name)').gte('created_at', desde).order('created_at', { ascending: false }).limit(300),
        supabase.from('shift_report_details').select('facturacion, tips, shift_reports!inner(fecha)').eq('shift_reports.fecha', hoy),
        supabase.from('shift_reports').select('*', { count: 'exact', head: true }).eq('fecha', hoy),
        supabase.from('training_pills').select('id, numero').eq('activa', true).eq('fecha_publicacion', hoy).limit(1),
        getProfilesByRoles(['admin', 'manager', 'chatter'], { onlyActive: true }),
        supabase.from('shift_reports')
          .select('id, fecha, turno, created_at, profiles(full_name), shift_report_details(texto, trafico, facturacion, tips, models(stage_name))')
          .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(MAX_REPORTES),
      ])
      setSanciones(sancionesData || [])
      setReportes(reps || [])

      // último evento de cada chatter (dentro de la ventana de turno) → quién está trabajando o en break ahora mismo
      const ultimos = {}
      ;(eventos || []).forEach((e) => { if (!ultimos[e.chatter_id]) ultimos[e.chatter_id] = e })
      setEnTurno(Object.values(ultimos).filter((e) => e.tipo !== 'salida').sort((a, b) => (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '')))

      const facturacionHoy = (repDetails || []).reduce((s, r) => s + (Number(r.facturacion) || 0) + (Number(r.tips) || 0), 0)

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

      {esChatTeam && <BarraTurno enTurno={enTurno} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon="diamond" label="Modelos activas" value={stats?.modelsCount ?? '—'} />
        <Kpi icon="camera" label="Cuentas de Instagram" value={stats?.accountsCount ?? '—'} />
        <Kpi icon="target" label="Leads en proceso" value={stats?.leadsCount ?? '—'} />
        <Kpi
          icon="dollar" label="Fac. cuentas · última semana"
          value={stats ? `$${Math.round(stats.totalSemana).toLocaleString('es-ES')}` : '—'}
          sub={stats?.semana ? `semana del ${fmtFecha(stats.semana)}` : ''}
        />
      </div>

      {esChatTeam && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Kpi
              icon="dollar" label="Facturado hoy (reportes)"
              value={chatStats ? fmt$(chatStats.facturacionHoy) : '—'}
              sub={chatStats ? 'PPV + tips de los turnos de hoy' : ''}
            />
            <Kpi
              icon="file" label="Reportes enviados hoy"
              value={chatStats ? chatStats.reportesHoy : '—'}
            />
            <Kpi
              icon="book" label="Píldora de hoy"
              value={chatStats?.formacion ? `${chatStats.formacion.respondieron}/${chatStats.formacion.total}` : (chatStats ? 'Sin activar' : '—')}
              sub={chatStats?.formacion ? `#${chatStats.formacion.numero} · han respondido` : ''}
            />
          </div>

          <Panel className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <p className="text-sm font-medium flex items-center gap-2"><Icon name="file" size={16} /> Últimos reportes de turno</p>
              <Link to="/reportes-turno" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Ver todos los reportes →</Link>
            </div>
            {reportes === null ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
            ) : reportes.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay reportes.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {reportes.slice(0, visibles).map((r) => <TarjetaReporte key={r.id} r={r} />)}
                </div>
                <div className="flex items-center justify-center gap-4 mt-4">
                  {visibles < reportes.length && (
                    <button onClick={() => setVisibles((v) => Math.min(v + POR_PAGINA, reportes.length))} className="text-sm px-4 py-1.5 rounded-full" style={{ border: '1px solid var(--border)', color: 'var(--accent)' }}>
                      Ver más
                    </button>
                  )}
                  {visibles > POR_PAGINA && (
                    <button onClick={() => setVisibles(POR_PAGINA)} className="text-sm px-4 py-1.5 rounded-full" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      Ver menos
                    </button>
                  )}
                </div>
              </>
            )}
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-medium mb-4 flex items-center gap-2"><Icon name="alert" size={16} /> Sanciones recientes del equipo</p>
            {sanciones === null ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
            ) : sanciones.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin sanciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {sanciones.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm p-3 rounded-lg" style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: 'var(--danger)22', color: 'var(--danger)' }}>{inicial(s.profiles?.full_name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{s.profiles?.full_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.motivo}</p>
                    </div>
                    {s.monto > 0 && <span className="tabular-nums font-medium" style={{ color: 'var(--danger)' }}>{fmt$(s.monto)}</span>}
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
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
