import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Panel, Button, Select, Table, Td, PageHeader } from '../components/ui'

const TURNOS = ['Mañana (8:00–16:00)', 'Tarde (16:00–24:00)', 'Madrugada (0:00–8:00)']

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Attendance() {
  const { profile, role } = useAuth()
  const isSupervisor = role === 'admin' || role === 'manager'
  const [active, setActive] = useState(null)
  const [turno, setTurno] = useState(TURNOS[0])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    let query = supabase.from('attendance').select('*, profiles(full_name)').order('clock_in', { ascending: false }).limit(50)
    const { data } = await query
    setHistory(data || [])
    if (!isSupervisor) {
      const mine = (data || []).find((a) => a.chatter_id === profile?.id && !a.clock_out)
      setActive(mine || null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function clockIn() {
    setError(null)
    const { data, error } = await supabase
      .from('attendance')
      .insert([{ chatter_id: profile.id, turno }])
      .select()
      .single()
    if (error) { setError('No se pudo fichar entrada.'); return }
    setActive(data)
    load()
  }

  async function clockOut() {
    if (!active) return
    await supabase.from('attendance').update({ clock_out: new Date().toISOString() }).eq('id', active.id)
    setActive(null)
    load()
  }

  async function toggleBreak() {
    if (!active) return
    const breaks = [...(active.breaks || [])]
    const open = breaks.find((b) => !b.end)
    if (open) {
      open.end = new Date().toISOString()
    } else {
      breaks.push({ start: new Date().toISOString(), end: null })
    }
    const { data } = await supabase.from('attendance').update({ breaks }).eq('id', active.id).select().single()
    setActive(data)
  }

  const onBreak = active?.breaks?.some((b) => !b.end)

  return (
    <div>
      <PageHeader title="Entradas y salidas" subtitle="Marca tu jornada y tus breaks (pausas para comer o asuntos personales)." />

      {!isSupervisor && (
        <Panel className="p-5 mb-6">
          {!active ? (
            <div className="flex items-center gap-3">
              <Select value={turno} onChange={(e) => setTurno(e.target.value)} className="max-w-xs">
                {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Button onClick={clockIn}>Fichar entrada</Button>
            </div>
          ) : (
            <div>
              <p className="text-sm mb-3">
                Turno activo: <strong>{active.turno}</strong> — entrada {fmt(active.clock_in)}
              </p>
              <div className="flex gap-2">
                <Button variant={onBreak ? 'primary' : 'ghost'} onClick={toggleBreak}>
                  {onBreak ? 'Terminar break' : 'Iniciar break'}
                </Button>
                <Button variant="danger" onClick={clockOut}>Fichar salida</Button>
              </div>
            </div>
          )}
          {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
        </Panel>
      )}

      <Panel>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Table
            columns={['Chatter', 'Turno', 'Entrada', 'Salida', 'Breaks']}
            rows={history}
            renderRow={(a) => (
              <>
                <Td>{a.profiles?.full_name}</Td>
                <Td>{a.turno}</Td>
                <Td>{fmt(a.clock_in)}</Td>
                <Td>{fmt(a.clock_out)}</Td>
                <Td>{(a.breaks || []).length}</Td>
              </>
            )}
          />
        )}
      </Panel>
    </div>
  )
}
