import { useEffect, useMemo, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProfilesByRoles } from '../lib/roles'
import { Panel, Button, Input, Select, PageHeader } from '../components/ui'

const TURNOS = [
  { id: 'madrugada', n: 'Madrugada', h: '2:00–10:00' },
  { id: 'mañana', n: 'Mañana', h: '10:00–18:00' },
  { id: 'tarde', n: 'Tarde', h: '18:00–2:00' },
]
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function mondayOf(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function fmtFecha(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function fechaHoyISO() { return isoDate(new Date()) }

export default function Schedules() {
  const { hasAnyRole } = useAuth()
  const esMgr = hasAnyRole(['admin', 'manager'])
  const [tab, setTab] = useState('sem')

  return (
    <div>
      <PageHeader title="Horarios" subtitle="Asignación semanal de chatters por turno y grupo de modelos." />
      <div className="flex gap-2 mb-5">
        {[['sem', 'Semana'], ['grp', 'Grupos de modelos']].map(([id, label]) => (
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
      {tab === 'sem' ? <HorarioSemana esMgr={esMgr} /> : <Grupos esMgr={esMgr} />}
    </div>
  )
}

function HorarioSemana({ esMgr }) {
  const { profile } = useAuth()
  const [lunes, setLunes] = useState(() => mondayOf(new Date()))
  const [rows, setRows] = useState([])
  const [chatters, setChatters] = useState([])
  const [grupos, setGrupos] = useState([])
  const [add, setAdd] = useState(null)

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(lunes, i)), [lunes])

  async function load() {
    const desde = isoDate(dias[0]), hasta = isoDate(dias[6])
    const [{ data: r }, u, { data: g }] = await Promise.all([
      supabase.from('schedules').select('*, profiles(full_name)').gte('fecha', desde).lte('fecha', hasta),
      getProfilesByRoles(['manager', 'chatter']),
      supabase.from('shift_groups').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setRows(r || []); setChatters(u); setGrupos(g || [])
  }
  useEffect(() => { load() }, [lunes])

  async function borrar(h) {
    await supabase.from('schedules').delete().eq('id', h.id)
    setRows((rs) => rs.filter((x) => x.id !== h.id))
  }

  const byKey = useMemo(() => {
    const g = {}
    for (const r of rows) { const k = r.fecha + '|' + r.turno; (g[k] = g[k] || []).push(r) }
    return g
  }, [rows])
  const hoy = fechaHoyISO()

  return (
    <div>
      <Panel className="p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setLunes(addDays(lunes, -7))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>‹</button>
          <strong className="min-w-[180px] text-center text-sm">{fmtFecha(isoDate(dias[0]))} – {fmtFecha(isoDate(dias[6]))}</strong>
          <button onClick={() => setLunes(addDays(lunes, 7))} className="px-2 py-1 rounded" style={{ border: '1px solid var(--border)' }}>›</button>
          <Button variant="ghost" onClick={() => setLunes(mondayOf(new Date()))}>Hoy</Button>
        </div>
        <div className="overflow-x-auto">
          <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, minmax(120px, 1fr))', gap: 4 }}>
            <div />
            {dias.map((d, i) => (
              <div key={i} className="text-xs text-center py-1" style={{ color: 'var(--text-muted)' }}>
                {DIAS[i].slice(0, 3)}<br />{d.getDate()}/{d.getMonth() + 1}
              </div>
            ))}
            {TURNOS.map((t) => (
              <Fragment key={t.id}>
                <div className="text-xs py-2 pr-2" style={{ color: 'var(--text-muted)' }}>
                  {t.n}<br /><span style={{ fontSize: 10 }}>{t.h}</span>
                </div>
                {dias.map((d, i) => {
                  const iso = isoDate(d); const k = iso + '|' + t.id; const cell = byKey[k] || []
                  return (
                    <div
                      key={i}
                      className="rounded-md p-1 min-h-[52px]"
                      style={{ background: iso === hoy ? 'var(--accent-soft)' : 'var(--panel-alt)', border: '1px solid var(--border)' }}
                    >
                      {cell.map((h) => (
                        <div key={h.id} className="text-xs rounded px-1.5 py-1 mb-1 flex justify-between items-center" style={{ background: 'var(--panel)' }}>
                          <span>
                            <strong>{h.profiles?.full_name}</strong>
                            {h.grupo_id ? <span style={{ color: 'var(--text-muted)' }}> · {grupos.find((g) => g.id === h.grupo_id)?.nombre}</span> : null}
                          </span>
                          {esMgr && <span onClick={() => borrar(h)} className="cursor-pointer" style={{ color: 'var(--danger)' }}>✕</span>}
                        </div>
                      ))}
                      {esMgr && (
                        <button
                          onClick={() => setAdd({ fecha: iso, turno: t.id, chatter_id: chatters[0]?.id || '', grupo_id: '' })}
                          className="text-xs w-full text-left opacity-60 hover:opacity-100"
                          style={{ color: 'var(--accent)' }}
                        >
                          + asignar
                        </button>
                      )}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </Panel>

      {add && (
        <Panel className="p-5 mb-6">
          <p className="text-sm font-medium mb-3">Asignar turno</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input type="date" value={add.fecha} onChange={(e) => setAdd({ ...add, fecha: e.target.value })} />
            <Select value={add.turno} onChange={(e) => setAdd({ ...add, turno: e.target.value })}>
              {TURNOS.map((t) => <option key={t.id} value={t.id}>{t.n} ({t.h})</option>)}
            </Select>
            <Select value={add.chatter_id} onChange={(e) => setAdd({ ...add, chatter_id: e.target.value })}>
              {chatters.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
            <Select value={add.grupo_id} onChange={(e) => setAdd({ ...add, grupo_id: e.target.value })}>
              <option value="">— sin grupo —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!add.chatter_id) return
                await supabase.from('schedules').insert([{ ...add, grupo_id: add.grupo_id || null, creado_por: profile.id }])
                setAdd(null); load()
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setAdd(null)}>Cancelar</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

function Grupos({ esMgr }) {
  const [rows, setRows] = useState([])
  const [edit, setEdit] = useState(null)

  async function load() {
    const { data } = await supabase.from('shift_groups').select('*').order('esquema').order('nombre')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function borrar(g) {
    if (!confirm(`¿Eliminar el grupo "${g.nombre}"?`)) return
    await supabase.from('shift_groups').delete().eq('id', g.id)
    load()
  }

  const porEsq = useMemo(() => {
    const g = {}
    for (const r of rows) { const k = r.esquema || 'Otros'; (g[k] = g[k] || []).push(r) }
    return g
  }, [rows])

  return (
    <div>
      <Panel className="p-4 mb-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Los grupos son fijos pero el manager los ajusta si entran o salen modelos. Según cuántos chatters haya en un turno se usa el esquema correspondiente.
        </p>
      </Panel>
      {esMgr && (
        <Button className="mb-4" onClick={() => setEdit({ nombre: '', nchatters: 3, modelos: '' })}>+ Nuevo grupo</Button>
      )}
      {Object.keys(porEsq).length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin grupos todavía</p>
      ) : (
        Object.keys(porEsq).sort((a, b) => {
          const na = parseInt((a.match(/\d+/) || [999])[0])
          const nb = parseInt((b.match(/\d+/) || [999])[0])
          return na - nb
        }).map((esq) => (
          <div key={esq} className="mb-6">
            <p className="text-sm font-medium mb-2">{esq} <span style={{ color: 'var(--text-muted)' }}>({porEsq[esq].length})</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {porEsq[esq].map((g) => (
                <Panel key={g.id} className="p-4">
                  <p className="font-medium mb-1">{g.nombre}</p>
                  <p className="text-xs whitespace-pre-wrap mb-3" style={{ color: 'var(--text-muted)' }}>{g.modelos}</p>
                  {esMgr && (
                    <div className="flex gap-2">
                      <button onClick={() => setEdit({ ...g, nchatters: parseInt((g.esquema.match(/\d+/) || [3])[0]) })} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>Editar</button>
                      <button onClick={() => borrar(g)} className="text-xs hover:underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          </div>
        ))
      )}

      {edit && (
        <Panel className="p-5 mt-4">
          <p className="text-sm font-medium mb-3">{edit.id ? 'Editar grupo' : 'Nuevo grupo'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input placeholder="Nombre del grupo" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} />
            <Input type="number" min="2" max="20" placeholder="¿Para cuántos chatters?" value={edit.nchatters} onChange={(e) => setEdit({ ...edit, nchatters: e.target.value })} />
          </div>
          <textarea
            value={edit.modelos}
            onChange={(e) => setEdit({ ...edit, modelos: e.target.value })}
            placeholder="Alicia, Violeta, Valen..."
            rows={3}
            className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none mb-3"
            style={{ background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!edit.nombre.trim()) return
                const nNum = Math.max(2, parseInt(edit.nchatters) || 2)
                const payload = { nombre: edit.nombre.trim(), esquema: `Para ${nNum} chatters`, modelos: edit.modelos }
                if (edit.id) await supabase.from('shift_groups').update(payload).eq('id', edit.id)
                else await supabase.from('shift_groups').insert([{ ...payload, activo: true }])
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
