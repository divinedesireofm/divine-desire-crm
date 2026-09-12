import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'
import CopyButton from '../components/CopyButton'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function fechaHoyISO() { return isoDate(new Date()) }

export default function Massives() {
  const [tab, setTab] = useState('cal')
  return (
    <div>
      <PageHeader title="Masivos PPV" subtitle="Calendario de quién envía qué modelo cada día, y los formatos de los masivos." />
      <div className="flex gap-2 mb-5">
        {[['cal', 'Calendario'], ['fmt', 'Formatos']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3 py-1.5 rounded-full text-sm"
            style={{
              background: tab === id ? 'var(--accent-soft)' : 'var(--panel-alt)',
              border: `1px solid ${tab === id ? 'var(--accent)' : 'var(--border)'}`,
              color: tab === id ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'cal' ? <MasivosCal /> : <Formatos />}
    </div>
  )
}

function MasivosCal() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [rows, setRows] = useState([])
  const [modelos, setModelos] = useState([])
  const [chatters, setChatters] = useState([])
  const [add, setAdd] = useState(null)

  const y = ref.getFullYear(), mo = ref.getMonth()
  const first = new Date(y, mo, 1), last = new Date(y, mo + 1, 0)

  async function load() {
    const desde = isoDate(first), hasta = isoDate(last)
    const [{ data: r }, { data: m }, u] = await Promise.all([
      supabase.from('massive_calendar').select('*, profiles(full_name), models(stage_name)').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('models').select('id, stage_name').eq('status', 'activa').order('stage_name'),
      getProfilesByRoles(['manager', 'chatter']),
    ])
    setRows(r || []); setModelos(m || []); setChatters(u)
  }
  useEffect(() => { load() }, [y, mo])

  async function borrar(ev) {
    if (!confirm(`¿Eliminar ${ev.profiles?.full_name} → ${ev.models?.stage_name}?`)) return
    await supabase.from('massive_calendar').delete().eq('id', ev.id)
    setRows((rs) => rs.filter((x) => x.id !== ev.id))
  }

  const byDay = useMemo(() => {
    const g = {}
    for (const r of rows) { (g[r.fecha] = g[r.fecha] || []).push(r) }
    return g
  }, [rows])

  const startPad = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)
  const hoy = fechaHoyISO()

  return (
    <div>
      <Panel className="p-4 mb-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setRef(new Date(y, mo - 1, 1))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>‹</button>
            <strong className="min-w-[150px] text-center">{MESES[mo]} {y}</strong>
            <button onClick={() => setRef(new Date(y, mo + 1, 1))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>›</button>
          </div>
          {esMgr && (
            <Button onClick={() => setAdd({ fecha: hoy, chatter_id: chatters[0]?.id || '', modelos: [], nota: '' })}>+ Asignar masivo</Button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 4 }}>
          {DIAS.map((d) => <div key={d} className="text-xs text-center py-1" style={{ color: 'var(--text-muted)' }}>{d.slice(0, 3)}</div>)}
          {cells.map((d, i) => {
            if (d === null) return <div key={'e' + i} />
            const iso = isoDate(new Date(y, mo, d))
            const evs = byDay[iso] || []
            const porChatter = {}
            evs.forEach((ev) => { const k = ev.profiles?.full_name || '—'; (porChatter[k] = porChatter[k] || []).push(ev) })
            return (
              <div key={iso} className="rounded-md p-1.5 min-h-[80px]" style={{ background: iso === hoy ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{d}</span>
                  {esMgr && <span onClick={() => setAdd({ fecha: iso, chatter_id: chatters[0]?.id || '', modelos: [], nota: '' })} className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>+</span>}
                </div>
                {Object.entries(porChatter).map(([nombre, items]) => (
                  <div key={nombre} className="mb-1">
                    <p className="text-xs font-medium truncate">{nombre}</p>
                    <div className="flex flex-wrap gap-1">
                      {items.map((ev) => (
                        <span
                          key={ev.id}
                          onClick={() => esMgr && borrar(ev)}
                          title={ev.nota ? `${ev.nota} · clic para eliminar` : 'Clic para eliminar'}
                          className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                          style={{ background: 'var(--panel)', color: 'var(--accent)' }}
                        >
                          {ev.models?.stage_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Panel>

      {add && (
        <MasivoModal add={add} modelos={modelos} chatters={chatters} profile={profile}
          onClose={() => setAdd(null)} onSaved={() => { setAdd(null); load() }} />
      )}
    </div>
  )
}

function MasivoModal({ add, modelos, chatters, profile, onClose, onSaved }) {
  const [fecha, setFecha] = useState(add.fecha)
  const [chatterId, setChatterId] = useState(add.chatter_id)
  const [nota, setNota] = useState('')
  const [mods, setMods] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id) { setMods((ms) => ms.includes(id) ? ms.filter((x) => x !== id) : ms.concat([id])) }

  async function guardar() {
    if (!chatterId) { setError('Selecciona el chatter.'); return }
    if (!mods.length) { setError('Selecciona al menos una modelo.'); return }
    setBusy(true)
    const filas = mods.map((modelo_id) => ({ fecha, chatter_id: chatterId, modelo_id, nota, creado_por: profile.id }))
    const { error } = await supabase.from('massive_calendar').insert(filas)
    setBusy(false)
    if (error) { setError('No se pudo guardar.'); return }
    onSaved()
  }

  return (
    <Panel className="p-5 mt-4">
      <p className="text-sm font-medium mb-3">Asignar masivo</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Select value={chatterId} onChange={(e) => setChatterId(e.target.value)}>
          {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </Select>
      </div>
      <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Modelos (toca para seleccionar varias)</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {modelos.map((m) => {
          const on = mods.includes(m.id)
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className="px-3 py-1.5 rounded-full text-sm"
              style={{ background: on ? 'var(--accent-soft)' : 'var(--panel-alt)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text)' }}
            >
              {m.stage_name}
            </button>
          )
        })}
      </div>
      <Input placeholder="Nota (opcional, aplica a todas las seleccionadas)" value={nota} onChange={(e) => setNota(e.target.value)} className="mb-3" />
      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex gap-2">
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : `Guardar${mods.length > 1 ? ` (${mods.length})` : ''}`}</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
    </Panel>
  )
}

function Formatos() {
  const { profile, hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('massive_formats').select('*, profiles(full_name)').order('created_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      {esMgr && <Button className="mb-4" onClick={() => setEdit({ titulo: '', contenido: '' })}>+ Nuevo formato</Button>}
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin formatos todavía.</p>
      ) : rows.map((f) => (
        <Panel key={f.id} className="p-4 mb-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="font-medium">{f.titulo}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.profiles?.full_name ? `editado por ${f.profiles.full_name}` : ''}</span>
              <CopyButton text={f.contenido} />
              {esMgr && <button onClick={() => setEdit(f)} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>}
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap font-mono" style={{ color: 'var(--text-muted)' }}>{f.contenido}</p>
        </Panel>
      ))}
      {edit && (
        <Panel className="p-5">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar formato' : 'Nuevo formato'}</p>
          <Input placeholder="Título" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} className="mb-3" />
          <textarea
            value={edit.contenido}
            onChange={(e) => setEdit({ ...edit, contenido: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3 font-mono"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.titulo.trim()) return
                const payload = { titulo: edit.titulo, contenido: edit.contenido, actualizado_por: profile.id, updated_at: new Date().toISOString() }
                if (edit.id) await supabase.from('massive_formats').update(payload).eq('id', edit.id)
                else await supabase.from('massive_formats').insert([payload])
                setEdit(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
