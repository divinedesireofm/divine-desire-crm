import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, Select, Table, Td, PageHeader } from '../components/ui'

function fmtTS(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

const ACCION_LABEL = { insert: 'Creó', update: 'Editó', delete: 'Borró' }
const ENTIDAD_LABEL = {
  models: 'Modelo', instagram_accounts: 'Cuenta IG', weekly_metrics: 'Métricas', recruitment_leads: 'Lead',
  attendance_events: 'Fichaje', shift_reports: 'Reporte de turno', schedules: 'Horario', shift_groups: 'Grupo',
  sanctions: 'Sanción', payment_periods: 'Periodo de pago', payments: 'Pago', sales_packs: 'Pack',
  sales_scripts: 'Script', price_list: 'Precio', activation_messages: 'Activación',
}

export default function Activity() {
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [fAccion, setFAccion] = useState('todas')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(400)
    if (fAccion !== 'todas') q = q.eq('accion', fAccion)
    const [{ data }, { data: profs }] = await Promise.all([q, supabase.from('profiles').select('id, full_name, role')])
    setRows(data || [])
    const m = {}
    ;(profs || []).forEach((p) => { m[p.id] = p })
    setNames(m)
    setLoading(false)
  }
  useEffect(() => { load() }, [fAccion])

  const acciones = useMemo(() => Array.from(new Set(rows.map((r) => r.accion))).sort(), [rows])

  return (
    <div>
      <PageHeader title="Historial" subtitle="Registro de toda la actividad del equipo en el CRM." />
      <Panel>
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-medium">Actividad</p>
          <Select value={fAccion} onChange={(e) => setFAccion(e.target.value)} className="max-w-[180px]">
            <option value="todas">Todas las acciones</option>
            {acciones.map((a) => <option key={a} value={a}>{ACCION_LABEL[a] || a}</option>)}
          </Select>
        </div>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Cuándo', 'Quién', 'Acción', 'Entidad', 'Detalle']}
            rows={rows}
            renderRow={(r) => (
              <>
                <Td><span style={{ color: 'var(--text-muted)' }}>{fmtTS(r.created_at)}</span></Td>
                <Td>
                  <strong>{names[r.usuario_id]?.full_name || '—'}</strong>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{names[r.usuario_id]?.role || ''}</div>
                </Td>
                <Td>
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {ACCION_LABEL[r.accion] || r.accion}
                  </span>
                </Td>
                <Td style={{ color: 'var(--text-muted)' }}>{ENTIDAD_LABEL[r.entidad] || r.entidad}</Td>
                <Td style={{ whiteSpace: 'pre-wrap' }}>{r.detalle || '—'}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
